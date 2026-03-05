"""Task-to-model routing for LiteLLM proxy.

Maps task types to LiteLLM model names. LiteLLM handles provider routing,
fallbacks, retries, and budget tracking.
"""

# Task type → LiteLLM model name
# LiteLLM config defines what provider each model routes to and its fallback chain.
TASK_MODEL_MAP = {
    "extraction": "local-extract",  # Ollama first, LiteLLM handles fallback
    "analysis": "local-extract",  # Same — local for classification/scoring
    "document": "claude-document",  # Claude for quality generation
    "chat": "claude-document",  # Claude for conversational
}

# Default model when task type isn't in the map
DEFAULT_MODEL = "gemini-general"


def get_model_for_task(task_type: str, use_local: bool = True) -> str:
    """Return the LiteLLM model name for a given task type.

    Args:
        task_type: One of "extraction", "analysis", "document", "chat"
        use_local: When False, any local-* model is replaced with DEFAULT_MODEL.
            This lets callers skip Ollama when it's intentionally offline.

    Returns:
        LiteLLM model name (e.g. "local-extract", "claude-document")
    """
    model = TASK_MODEL_MAP.get(task_type, DEFAULT_MODEL)
    if not use_local and model.startswith("local-"):
        return DEFAULT_MODEL
    return model
