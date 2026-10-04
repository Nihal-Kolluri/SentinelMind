"""Groq LLM wrapper. No native function calling: agents ask for JSON and we parse defensively,
retrying and falling back to a second model, so tool-call errors can't crash an incident."""
import json, os, re, time, logging

log = logging.getLogger("sentinelmind.llm")


class LLMError(Exception):
    pass


def _extract_json(text: str) -> dict:
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in response")
    return json.loads(text[start:end + 1])


class GroqLLM:
    def __init__(self):
        from openai import OpenAI
        self.client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url="https://api.groq.com/openai/v1")
        self.models = [os.getenv("LLM_MODEL", "openai/gpt-oss-120b"),
                       os.getenv("LLM_FALLBACK_MODEL", "qwen/qwen3-32b")]

    def json(self, system: str, user: str, retries: int = 2) -> dict:
        last = None
        for model in self.models:
            for attempt in range(retries + 1):
                try:
                    r = self.client.chat.completions.create(
                        model=model, temperature=0.2,
                        messages=[{"role": "system", "content": system + "\nReply with ONE JSON object only."},
                                  {"role": "user", "content": user}])
                    return _extract_json(r.choices[0].message.content)
                except Exception as e:  # rate limit, malformed JSON, timeout...
                    last = e
                    log.warning("LLM %s attempt %d failed: %s", model, attempt + 1, e)
                    time.sleep(0.5 * 2 ** attempt)
        raise LLMError(f"all models failed: {last}")
