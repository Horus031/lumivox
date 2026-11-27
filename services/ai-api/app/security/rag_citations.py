import re

_PROTECTED_MARKDOWN = re.compile(
    r"(?ms)^ {0,3}(`{3,}|~{3,})[^\n]*\n.*?(?:^ {0,3}\1[ \t]*$|\Z)"
    r"|(?<!`)(`+)(?!`)[^\n]*?(?<!`)\2(?!`)|\$\$.*?\$\$|\$[^\n$]*?\$"
)
_SOURCE = re.compile(r"(?<!\\)\[source ([0-9]+)\](?:\([^\n)]*\)|\[[^\n\]]*\])?", re.IGNORECASE)


def validate_rag_citations(text: str, source_count: int) -> tuple[str, bool]:
    unsupported = False

    def replace(match: re.Match[str]) -> str:
        nonlocal unsupported
        if len(match[1]) <= len(str(source_count)) and 1 <= int(match[1]) <= source_count:
            return rf"\[source {int(match[1])}\]"
        unsupported = True
        return r"\[source unavailable\]"

    result, start = [], 0
    for block in _PROTECTED_MARKDOWN.finditer(text):
        result.extend((_SOURCE.sub(replace, text[start:block.start()]), block[0]))
        start = block.end()
    result.append(_SOURCE.sub(replace, text[start:]))
    return "".join(result), unsupported
