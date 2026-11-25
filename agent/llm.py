import os
from dataclasses import dataclass
from langchain_openai import ChatOpenAI


@dataclass(frozen=True)
class LLMConfig:
    model: str
    base_url: str | None
    api_key: str
    temperature: float
    structured_method: str | None


def     load_llm_config() -> LLMConfig:
    base_url = os.getenv("LLM_BASE_URL", "").strip() or None
    model = os.getenv("LLM_MODEL", "gpt-4o-mini").strip()
    api_key = (
        os.getenv("LLM_API_KEY", "").strip()
        or os.getenv("OPENAI_API_KEY", "").strip()
        or ("local-not-needed" if base_url else "")
    )
    if not api_key:
        raise RuntimeError("Set LLM_API_KEY or OPENAI_API_KEY (or LLM_BASE_URL for local models).")

    structured_method = os.getenv("LLM_STRUCTURED_METHOD", "").strip() or None
    return LLMConfig(
        model=model,
        base_url=base_url,
        api_key=api_key,
        temperature=float(os.getenv("LLM_TEMPERATURE", "0.0")),
        structured_method=structured_method,
    )


def get_llm(config: LLMConfig | None = None) -> tuple[ChatOpenAI, LLMConfig]:
    cfg = config or load_llm_config()
    llm = ChatOpenAI(
        model=cfg.model,
        api_key=cfg.api_key,
        base_url=cfg.base_url,
        temperature=cfg.temperature,
        streaming=True,
        stream_usage=True,
        max_retries=2,
        timeout=float(os.getenv("LLM_TIMEOUT_SEC", "180")),
        default_headers={"Connection": "close"},
    )
    return llm, cfg
