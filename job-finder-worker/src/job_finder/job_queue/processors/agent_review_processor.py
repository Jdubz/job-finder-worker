"""Agent review processor for analyzing and recovering failed tasks.

This processor handles AGENT_REVIEW queue items by:
1. Analyzing what went wrong with the parent task
2. Attempting to recover/fix the issue
3. Recording findings in review_notes
"""

import json
import logging
import traceback
from typing import Any, Dict, Optional

from job_finder.ai.providers import AIProvider, create_provider_from_config
from job_finder.exceptions import AIProviderError, InitializationError
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueStatus

from .base_processor import BaseProcessor

logger = logging.getLogger(__name__)


AGENT_REVIEW_SYSTEM_PROMPT = """You are an expert system analyst reviewing failed automated tasks.

Your job is to:
1. ANALYZE: What went wrong? Why did the automated task fail?
2. DIAGNOSE: Identify the root cause (network issue, data quality, config error, etc.)
3. RECOMMEND: What actions could fix this issue?
4. RECOVER: If possible, provide the correct data/output that was expected.

Be concise but thorough. Focus on actionable insights."""

# Keywords that suggest the AI analysis found a recoverable issue
_RECOVERY_INDICATORS = [
    "can be fixed",
    "should retry",
    "correct data",
    "recovery data",
    "here is the",
    "the correct",
    "extracted information",
]


class AgentReviewProcessor(BaseProcessor):
    """Processor for AGENT_REVIEW queue items."""

    def __init__(
        self,
        queue_manager: QueueManager,
        config_loader: ConfigLoader,
    ):
        """
        Initialize agent review processor.

        Args:
            queue_manager: Queue manager for updating item status
            config_loader: Configuration loader for AI settings
        """
        super().__init__(queue_manager, config_loader)
        self._ai_provider: Optional[AIProvider] = None

    def _get_ai_provider(self) -> Optional[AIProvider]:
        """Lazily initialize AI provider from config."""
        if self._ai_provider is None:
            try:
                ai_settings = self.config_loader.get_ai_settings()
                self._ai_provider = create_provider_from_config(ai_settings)
            except (AIProviderError, InitializationError) as exc:
                logger.warning("AI provider unavailable for agent review: %s", exc)
                self._ai_provider = None
        return self._ai_provider

    def process_agent_review(self, item: JobQueueItem) -> None:
        """
        Process an AGENT_REVIEW queue item.

        Flow:
        1. Extract the agent prompt and context from scraped_data
        2. Fetch the parent item to understand what failed
        3. Call AI to analyze the failure
        4. Store analysis in review_notes
        5. If AI suggests a fix, attempt recovery
        6. Update status based on outcome

        Args:
            item: The AGENT_REVIEW queue item
        """
        if not item.id:
            logger.error("Cannot process AGENT_REVIEW without ID")
            return

        logger.info(f"AGENT_REVIEW: Processing review for {item.parent_item_id or item.url}")

        # Extract context from scraped_data
        scraped_data = item.scraped_data or {}
        agent_prompt = scraped_data.get("agent_prompt", "")
        context = {k: v for k, v in scraped_data.items() if k != "agent_prompt"}

        # Fetch parent item if available
        parent_item = None
        if item.parent_item_id:
            parent_item = self.queue_manager.get_item(item.parent_item_id)

        # Get AI provider
        provider = self._get_ai_provider()
        if not provider:
            # No AI available - mark as needs_review for manual handling
            self.queue_manager.update_status(
                item.id,
                QueueStatus.NEEDS_REVIEW,
                "AI provider unavailable - requires manual review",
            )
            return

        try:
            # Build the analysis prompt
            analysis_prompt = self._build_analysis_prompt(
                agent_prompt=agent_prompt,
                context=context,
                parent_item=parent_item,
                review_item=item,
            )

            # Call AI for analysis
            logger.info("Calling AI for failure analysis...")
            analysis_response = provider.generate(
                prompt=analysis_prompt,
                max_tokens=2000,
                temperature=0.3,  # Lower temperature for more focused analysis
            )

            # Parse the response
            review_notes = f"## AI Analysis\n\n{analysis_response}"

            # Check if analysis suggests the issue is recoverable
            is_recoverable = self._check_if_recoverable(analysis_response)

            if is_recoverable and parent_item:
                # Attempt recovery
                recovery_result = self._attempt_recovery(
                    provider=provider,
                    parent_item=parent_item,
                    analysis=analysis_response,
                    context=context,
                )
                if recovery_result:
                    review_notes += f"\n\n## Recovery Attempt\n\n{recovery_result}"

            # Update the review item with notes
            self.queue_manager.update_status(
                item.id,
                QueueStatus.SUCCESS,
                "Agent review completed",
            )

            # Also update the parent item's review_notes if available
            if parent_item and parent_item.id:
                self.queue_manager.update_status(
                    parent_item.id,
                    QueueStatus(parent_item.status),  # Keep existing status
                    parent_item.result_message,
                )

            logger.info(f"AGENT_REVIEW complete for {item.id}")

        except Exception as e:
            error_msg = f"Agent review failed: {str(e)}"
            logger.error(f"Error in AGENT_REVIEW: {e}\n{traceback.format_exc()}")
            self.queue_manager.update_status(
                item.id,
                QueueStatus.FAILED,
                error_msg,
                error_details=traceback.format_exc(),
            )

    def _build_analysis_prompt(
        self,
        agent_prompt: str,
        context: Dict[str, Any],
        parent_item: Optional[JobQueueItem],
        review_item: JobQueueItem,
    ) -> str:
        """Build the prompt for AI analysis."""
        prompt_parts = [AGENT_REVIEW_SYSTEM_PROMPT, ""]

        # Add the original task prompt
        if agent_prompt:
            prompt_parts.append("## Original Task Instructions")
            prompt_parts.append(agent_prompt)
            prompt_parts.append("")

        # Add review request reason (why this review was spawned)
        if review_item.result_message:
            prompt_parts.append("## Review Reason")
            prompt_parts.append(review_item.result_message)
            prompt_parts.append("")

        # Add parent item details
        if parent_item:
            prompt_parts.append("## Failed Task Details")
            prompt_parts.append(f"- Type: {parent_item.type}")
            prompt_parts.append(f"- URL: {parent_item.url}")
            prompt_parts.append(f"- Company: {parent_item.company_name}")
            prompt_parts.append(f"- Status: {parent_item.status}")
            prompt_parts.append(f"- Result: {parent_item.result_message or 'N/A'}")
            if parent_item.error_details:
                prompt_parts.append(f"- Error Details: {parent_item.error_details[:1000]}")
            prompt_parts.append("")

        # Add context
        if context:
            prompt_parts.append("## Context Data")
            # Truncate large context values
            truncated_context: Dict[str, Any] = {}
            for k, v in context.items():
                if isinstance(v, str) and len(v) > 2000:
                    truncated_context[k] = v[:1980] + "... [truncated]"
                elif isinstance(v, (dict, list)):
                    # Convert to string for length check to avoid truncating valid JSON
                    str_v = str(v)
                    if len(str_v) > 2000:
                        truncated_context[k] = str_v[:1980] + "... [truncated]"
                    else:
                        truncated_context[k] = v
                else:
                    truncated_context[k] = v
            prompt_parts.append(json.dumps(truncated_context, indent=2, default=str))
            prompt_parts.append("")

        # Add review request
        prompt_parts.append("## Your Task")
        prompt_parts.append(
            "Analyze this failure and provide:\n"
            "1. **Root Cause**: What specifically went wrong?\n"
            "2. **Why It Failed**: What conditions or inputs led to this failure?\n"
            "3. **Recommendations**: What should be done to fix this?\n"
            "4. **Recovery Data**: If you can determine the correct output, provide it.\n"
        )

        return "\n".join(prompt_parts)

    def _check_if_recoverable(self, analysis: str) -> bool:
        """Check if the AI analysis suggests the issue is recoverable."""
        analysis_lower = analysis.lower()
        return any(indicator in analysis_lower for indicator in _RECOVERY_INDICATORS)

    def _attempt_recovery(
        self,
        provider: AIProvider,
        parent_item: JobQueueItem,
        analysis: str,
        context: Dict[str, Any],
    ) -> Optional[str]:
        """
        Attempt to recover from the failure based on AI analysis.

        This is a placeholder for more sophisticated recovery logic.
        For now, it just returns the analysis as the recovery attempt.
        """
        # TODO: Implement actual recovery logic based on parent item type
        # For example:
        # - COMPANY items: Try to extract company info from the context
        # - SOURCE_DISCOVERY: Try to generate a valid config
        # - SCRAPE_SOURCE: Try to fix the scraper config

        return "Recovery logic will be implemented based on the specific failure type."
