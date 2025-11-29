"""Tests for AI provider creation and configuration.

Tests the create_provider_from_config function which creates AI providers
based on the ai-settings configuration.
"""

import pytest
from unittest.mock import patch, MagicMock

from job_finder.ai.providers import (
    ClaudeProvider,
    CodexCLIProvider,
    GeminiCLIProvider,
    GeminiProvider,
    OpenAIProvider,
    create_provider_from_config,
)
from job_finder.exceptions import AIProviderError


class TestCreateProviderFromConfig:
    """Test create_provider_from_config with various configurations."""

    def test_creates_codex_cli_provider(self):
        """Should create CodexCLIProvider for codex/cli combination."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                }
            }
        }

        provider = create_provider_from_config(ai_settings)

        assert isinstance(provider, CodexCLIProvider)
        assert provider.model == "gpt-5-codex"

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
    @patch("job_finder.ai.providers.Anthropic")
    def test_creates_claude_api_provider(self, mock_anthropic):
        """Should create ClaudeProvider for claude/api combination."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "claude",
                    "interface": "api",
                    "model": "claude-sonnet-4-5-20250929",
                }
            }
        }

        provider = create_provider_from_config(ai_settings)

        assert isinstance(provider, ClaudeProvider)
        assert provider.model == "claude-sonnet-4-5-20250929"

    @patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"})
    @patch("job_finder.ai.providers.OpenAI")
    def test_creates_openai_api_provider(self, mock_openai):
        """Should create OpenAIProvider for openai/api combination."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "openai",
                    "interface": "api",
                    "model": "gpt-4o",
                }
            }
        }

        provider = create_provider_from_config(ai_settings)

        assert isinstance(provider, OpenAIProvider)
        assert provider.model == "gpt-4o"

    @patch.dict("os.environ", {"GOOGLE_API_KEY": "test-key"})
    def test_creates_gemini_api_provider(self):
        """Should create GeminiProvider for gemini/api combination."""
        try:
            import google.generativeai  # noqa: F401
        except ImportError:
            pytest.skip("google-generativeai package not installed")

            with (
                patch("google.generativeai.configure"),
                patch("google.generativeai.GenerativeModel"),
            ):
                ai_settings = {
                    "worker": {
                        "selected": {
                            "provider": "gemini",
                            "interface": "api",
                            "model": "gemini-2.0-flash",
                        }
                    }
                }

            provider = create_provider_from_config(ai_settings)

            assert isinstance(provider, GeminiProvider)
            assert provider.model == "gemini-2.0-flash"

    def test_raises_error_for_unsupported_provider_interface(self):
        """Should raise AIProviderError for unsupported combinations."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "unknown",
                    "interface": "api",
                    "model": "some-model",
                }
            }
        }

        with pytest.raises(AIProviderError, match="Unsupported provider/interface"):
            create_provider_from_config(ai_settings)

    def test_raises_error_for_codex_api_combination(self):
        """Should raise error for codex/api (not supported)."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "api",  # Codex only supports CLI
                    "model": "gpt-4o-mini",
                }
            }
        }

        with pytest.raises(AIProviderError, match="Unsupported provider/interface"):
            create_provider_from_config(ai_settings)

    def test_raises_error_for_claude_cli_combination(self):
        """Should raise error for claude/cli (not supported)."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "claude",
                    "interface": "cli",  # Claude only supports API
                    "model": "claude-sonnet-4-5-20250929",
                }
            }
        }

        with pytest.raises(AIProviderError, match="Unsupported provider/interface"):
            create_provider_from_config(ai_settings)

    def test_uses_defaults_when_selected_missing(self):
        """Should use default values when selected config is missing."""
        ai_settings = {}  # Empty config

        provider = create_provider_from_config(ai_settings)

        # Defaults to codex/cli/gpt-5-codex
        assert isinstance(provider, CodexCLIProvider)
        assert provider.model == "gpt-5-codex"

    def test_uses_defaults_for_partial_selected(self):
        """Should use defaults for missing fields in selected config."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    # interface and model missing
                }
            }
        }

        provider = create_provider_from_config(ai_settings)

        # Defaults interface to cli and model to gpt-5-codex
        assert isinstance(provider, CodexCLIProvider)
        assert provider.model == "gpt-5-codex"


class TestTaskSpecificProviderCreation:
    """Test create_provider_from_config with per-task overrides."""

    def test_task_override_uses_different_provider(self):
        """Should use task-specific provider when task override is specified."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                },
                "tasks": {
                    "jobMatch": {
                        "provider": "gemini",
                        "interface": "cli",
                    }
                }
            }
        }

        # Without task parameter - should use default (codex)
        default_provider = create_provider_from_config(ai_settings)
        assert isinstance(default_provider, CodexCLIProvider)

        # With task parameter - should use task override (gemini cli)
        task_provider = create_provider_from_config(ai_settings, task="jobMatch")
        assert isinstance(task_provider, GeminiCLIProvider)

    def test_task_without_override_uses_default(self):
        """Should fall back to selected when no task override exists."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                },
                "tasks": {
                    "jobMatch": {
                        "provider": "gemini",
                        "interface": "cli",
                    }
                    # sourceDiscovery not specified
                }
            }
        }

        # sourceDiscovery has no override, should use default
        provider = create_provider_from_config(ai_settings, task="sourceDiscovery")
        assert isinstance(provider, CodexCLIProvider)
        assert provider.model == "gpt-5-codex"

    def test_task_null_override_uses_default(self):
        """Should fall back to selected when task override is null."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                },
                "tasks": {
                    "sourceDiscovery": None  # Explicitly null
                }
            }
        }

        provider = create_provider_from_config(ai_settings, task="sourceDiscovery")
        assert isinstance(provider, CodexCLIProvider)

    def test_task_partial_override_merges_with_default(self):
        """Should merge partial task override with default config."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                },
                "tasks": {
                    "companyDiscovery": {
                        "provider": "gemini",
                        # interface and model not specified - should inherit defaults
                    }
                }
            }
        }

        provider = create_provider_from_config(ai_settings, task="companyDiscovery")
        # Should use gemini but with cli interface (inferred for gemini)
        assert isinstance(provider, GeminiCLIProvider)

    def test_task_override_with_model_null_uses_provider_default(self):
        """Should allow model=null to use provider's default model."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                },
                "tasks": {
                    "jobMatch": {
                        "provider": "gemini",
                        "interface": "cli",
                        "model": None,  # Explicitly null - use provider default
                    }
                }
            }
        }

        provider = create_provider_from_config(ai_settings, task="jobMatch")
        assert isinstance(provider, GeminiCLIProvider)
        # model=None passed to provider, which handles its own default

    def test_all_three_tasks_can_have_different_providers(self):
        """Should support different providers for each task."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                },
                "tasks": {
                    "jobMatch": {
                        "provider": "gemini",
                        "interface": "cli",
                    },
                    "companyDiscovery": {
                        "provider": "gemini",
                        "interface": "cli",
                    },
                    "sourceDiscovery": {
                        "provider": "codex",
                        "interface": "cli",
                        "model": "o4-mini",
                    }
                }
            }
        }

        job_match = create_provider_from_config(ai_settings, task="jobMatch")
        company = create_provider_from_config(ai_settings, task="companyDiscovery")
        source = create_provider_from_config(ai_settings, task="sourceDiscovery")

        assert isinstance(job_match, GeminiCLIProvider)
        assert isinstance(company, GeminiCLIProvider)
        assert isinstance(source, CodexCLIProvider)
        assert source.model == "o4-mini"

    def test_empty_tasks_section_uses_default(self):
        """Should use default when tasks section is empty."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                },
                "tasks": {}  # Empty tasks section
            }
        }

        provider = create_provider_from_config(ai_settings, task="jobMatch")
        assert isinstance(provider, CodexCLIProvider)

    def test_no_tasks_section_uses_default(self):
        """Should use default when tasks section is missing entirely."""
        ai_settings = {
            "worker": {
                "selected": {
                    "provider": "codex",
                    "interface": "cli",
                    "model": "gpt-5-codex",
                }
                # No tasks section at all
            }
        }

        provider = create_provider_from_config(ai_settings, task="jobMatch")
        assert isinstance(provider, CodexCLIProvider)


class TestCodexCLIProvider:
    """Test CodexCLIProvider behavior."""

    def test_init_with_model(self):
        """Should initialize with specified model."""
        provider = CodexCLIProvider(model="gpt-5-codex")
        assert provider.model == "gpt-5-codex"

    def test_init_with_default_model(self):
        """Should use default model when not specified."""
        provider = CodexCLIProvider()
        assert provider.model == "gpt-5-codex"

    def test_init_with_timeout(self):
        """Should accept custom timeout."""
        provider = CodexCLIProvider(timeout=120)
        assert provider.timeout == 120

    @patch("subprocess.run")
    def test_generate_success(self, mock_run):
        """Should successfully parse agent message from codex exec JSONL."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="\n".join(
                [
                    '{"type":"turn.started"}',
                    '{"type":"item.completed","item":{"type":"agent_message","text":"Test response"}}',
                    '{"type":"turn.completed"}',
                ]
            ),
            stderr="",
        )

        provider = CodexCLIProvider()
        result = provider.generate("Test prompt")

        assert result == "Test response"
        mock_run.assert_called_once()

    @patch("subprocess.run")
    def test_generate_uses_correct_cli_command(self, mock_run, tmp_path):
        """Should invoke 'codex exec --json' with cwd and model flags."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"type":"item.completed","item":{"type":"agent_message","text":"Test response"}}',
            stderr="",
        )

        with patch.dict("os.environ", {"CODEX_WORKDIR": str(tmp_path)}):
            provider = CodexCLIProvider(model="gpt-5-codex")
            provider.generate("Test prompt")

        cmd = mock_run.call_args[0][0]
        assert cmd[:4] == ["codex", "exec", "--json", "--skip-git-repo-check"]
        assert "--cd" in cmd and str(tmp_path) in cmd
        assert "--model" in cmd and "gpt-5-codex" in cmd
        assert cmd[-2:] == ["--", "Test prompt"]

    @patch("subprocess.run")
    def test_generate_retries_without_model_when_unsupported(self, mock_run):
        """Retry without model flag when ChatGPT account rejects model."""
        mock_run.side_effect = [
            MagicMock(
                returncode=1,
                stdout="",
                stderr="The 'gpt-4o' model is not supported when using Codex with a ChatGPT account.",
            ),
            MagicMock(
                returncode=0,
                stdout='{"type":"item.completed","item":{"type":"agent_message","text":"Fallback response"}}',
                stderr="",
            ),
        ]

        provider = CodexCLIProvider(model="gpt-4o")
        result = provider.generate("Test prompt")

        assert result == "Fallback response"
        assert mock_run.call_count == 2

    @patch("subprocess.run")
    def test_generate_cli_error(self, mock_run):
        """Should raise AIProviderError on CLI failure."""
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="Authentication required",
        )

        provider = CodexCLIProvider()

        with pytest.raises(AIProviderError, match="Codex CLI failed"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_timeout(self, mock_run):
        """Should raise AIProviderError on timeout."""
        import subprocess

        mock_run.side_effect = subprocess.TimeoutExpired(cmd="codex", timeout=60)

        provider = CodexCLIProvider()

        with pytest.raises(AIProviderError, match="timed out"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_empty_content_raises_error(self, mock_run):
        """Should raise AIProviderError when CLI returns empty content."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout='{"type":"turn.completed"}',
            stderr="",
        )

        provider = CodexCLIProvider()

        with pytest.raises(AIProviderError, match="no message content"):
            provider.generate("Test prompt")

    @patch("subprocess.run")
    def test_generate_malformed_json_raises_error(self, mock_run):
        """Should raise AIProviderError on malformed JSON response."""
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout="not valid json",
            stderr="",
        )

        provider = CodexCLIProvider()

        with pytest.raises(AIProviderError, match="no message content"):
            provider.generate("Test prompt")


class TestClaudeProvider:
    """Test ClaudeProvider behavior."""

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"})
    @patch("job_finder.ai.providers.Anthropic")
    def test_init_with_env_key(self, mock_anthropic):
        """Should use API key from environment."""
        provider = ClaudeProvider()
        assert provider.api_key == "test-key"
        mock_anthropic.assert_called_once_with(api_key="test-key")

    @patch("job_finder.ai.providers.Anthropic")
    def test_init_with_explicit_key(self, mock_anthropic):
        """Should use explicitly provided API key."""
        provider = ClaudeProvider(api_key="explicit-key")
        assert provider.api_key == "explicit-key"
        mock_anthropic.assert_called_once_with(api_key="explicit-key")

    @patch.dict("os.environ", {}, clear=True)
    def test_init_raises_without_key(self):
        """Should raise error when no API key available."""
        # Clear ANTHROPIC_API_KEY if it exists
        import os

        os.environ.pop("ANTHROPIC_API_KEY", None)

        with pytest.raises(AIProviderError, match="API key must be provided"):
            ClaudeProvider()

    def test_init_with_model(self):
        """Should use specified model."""
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "test-key"}):
            with patch("job_finder.ai.providers.Anthropic"):
                provider = ClaudeProvider(model="claude-3-opus")
                assert provider.model == "claude-3-opus"


class TestOpenAIProvider:
    """Test OpenAIProvider behavior."""

    @patch.dict("os.environ", {"OPENAI_API_KEY": "test-key"})
    @patch("job_finder.ai.providers.OpenAI")
    def test_init_with_env_key(self, mock_openai):
        """Should use API key from environment."""
        provider = OpenAIProvider()
        assert provider.api_key == "test-key"
        mock_openai.assert_called_once_with(api_key="test-key")

    @patch.dict("os.environ", {}, clear=True)
    def test_init_raises_without_key(self):
        """Should raise error when no API key available."""
        import os

        os.environ.pop("OPENAI_API_KEY", None)

        with pytest.raises(AIProviderError, match="API key must be provided"):
            OpenAIProvider()


class TestGeminiProvider:
    """Test GeminiProvider behavior."""

    @pytest.fixture(autouse=True)
    def skip_if_no_google(self):
        """Skip tests if google-generativeai is not installed."""
        try:
            import google.generativeai  # noqa: F401
        except ImportError:
            pytest.skip("google-generativeai package not installed")

    @patch.dict("os.environ", {"GOOGLE_API_KEY": "test-key"})
    @patch("google.generativeai.configure")
    @patch("google.generativeai.GenerativeModel")
    def test_init_with_google_api_key(self, mock_model, mock_configure):
        """Should use GOOGLE_API_KEY from environment."""
        provider = GeminiProvider()
        assert provider.api_key == "test-key"
        mock_configure.assert_called_once_with(api_key="test-key")

    @patch.dict("os.environ", {"GEMINI_API_KEY": "gemini-key"}, clear=True)
    @patch("google.generativeai.configure")
    @patch("google.generativeai.GenerativeModel")
    def test_init_with_gemini_api_key(self, mock_model, mock_configure):
        """Should fall back to GEMINI_API_KEY."""
        import os

        os.environ.pop("GOOGLE_API_KEY", None)
        provider = GeminiProvider()
        assert provider.api_key == "gemini-key"
        mock_configure.assert_called_once_with(api_key="gemini-key")

    @patch.dict("os.environ", {}, clear=True)
    def test_init_raises_without_key(self):
        """Should raise error when no API key available."""
        import os

        os.environ.pop("GOOGLE_API_KEY", None)
        os.environ.pop("GEMINI_API_KEY", None)

        with pytest.raises(AIProviderError, match="API key must be provided"):
            GeminiProvider()
