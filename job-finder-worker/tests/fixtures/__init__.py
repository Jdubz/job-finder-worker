"""Shared test fixtures and constants."""

# Shared AI settings configuration for tests
# Only claude.cli and gemini.api are supported after the agent simplification refactor
MOCK_AI_SETTINGS = {
    "agents": {
        "gemini.api": {
            "provider": "gemini",
            "interface": "api",
            "defaultModel": "gemini-2.0-flash",
            "dailyBudget": 100,
            "dailyUsage": 0,
            "runtimeState": {
                "worker": {"enabled": True, "reason": None},
                "backend": {"enabled": True, "reason": None},
            },
            "authRequirements": {
                "type": "api",
                "requiredEnv": ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
            },
        }
    },
    "taskFallbacks": {
        "extraction": ["gemini.api"],
        "analysis": ["gemini.api"],
        "document": ["gemini.api"],
    },
    "modelRates": {"gemini-2.0-flash": 0.5},
    "options": [],
}
