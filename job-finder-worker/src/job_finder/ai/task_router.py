"""Task-to-model routing for LiteLLM proxy.

Maps task types to LiteLLM model names. LiteLLM handles provider routing,
fallbacks, retries, and budget tracking.
"""

# Task type → LiteLLM model name
# LiteLLM config defines what provider each model routes to and its fallback chain.
TASK_MODEL_MAP = {
    "extraction": "local-extract",      # Ollama first, LiteLLM handles fallback
    "analysis":   "local-extract",      # Same — local for classification/scoring
    "document":   "claude-document",    # Claude for quality generation
    "chat":       "claude-document",    # Claude for conversational
}

# Default model when task type isn't in the map
DEFAULT_MODEL = "gemini-general"


def get_model_for_task(task_type: str) -> str:
    """Return the LiteLLM model name for a given task type.

    Args:
        task_type: One of "extraction", "analysis", "document", "chat"

    Returns:
        LiteLLM model name (e.g. "local-extract", "claude-document")
    """
    return TASK_MODEL_MAP.get(task_type, DEFAULT_MODEL)
