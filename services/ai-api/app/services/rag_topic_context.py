import re
import unicodedata
from typing import Literal

RagQuestionIntent = Literal["topic_change", "standalone", "referential", "continuation"]

_STOP_WORDS = set(
    "the a an is are was were be do did does what how why this that these those it its of to for and in "
    "on can could you we me my our about explain show another example give please then topic "
    "là của và có cho tôi mình bạn này đó gì nào thế như vậy không tại sao giải thích thêm tiếp tục "
    "về với hãy ví dụ trước còn phần điều một được".split()
)
EXPLICIT_TOPIC_CHANGE = re.compile(
    r"\b(new topic|unrelated question|switch topics|chủ đề mới|đổi chủ đề|câu hỏi khác)\b",
    re.IGNORECASE,
)
PREVIOUS_CONVERSATION = re.compile(
    r"\b(previous|earlier|last) (chat|conversation)\b|\b(cuộc )?hội thoại (trước|cũ)\b",
    re.IGNORECASE,
)
_REFERENTIAL = re.compile(
    r"\b(it|its|this|that|these|those|they|them|the former|the latter|which one|"
    r"the (?:original|previous|earlier) (?:array|exercise|example|answer|result)|"
    r"nó|chúng|cái này|cái đó|điều này|điều đó|phần này|phần đó|(?:mảng|bài|kết quả) (?:này|đó|trước))\b"
)
_CONTINUATION = re.compile(
    r"^(continue|explain more|give (me )?another example|show (me )?an example|"
    r"what about|how about|tiếp tục|giải thích thêm|cho (tôi |mình )?ví dụ|vậy còn|còn trường hợp)\b"
)
_SELF_CONTAINED = re.compile(
    r"`[^`\n]+`|\[\s*-?\d[^\]\n]*\]|"
    r"\b[\w]+\s*=\s*-?\d|\b(?:this|that|these|đoạn|mảng)\b[^:\n]{0,70}:\s*\S"
)


def normalize_topic_text(text: str) -> str:
    return unicodedata.normalize("NFKC", text).casefold()


def extract_topic_terms(text: str) -> set[str]:
    return {
        token for token in re.findall(r"[^\W_]+", normalize_topic_text(text))
        if len(token) >= 2 and token not in _STOP_WORDS
    }


def topic_overlap(question: str, context: str) -> int:
    return len(extract_topic_terms(question) & extract_topic_terms(context))


def classify_question_intent(question: str) -> RagQuestionIntent:
    normalized = normalize_topic_text(question).strip()
    if EXPLICIT_TOPIC_CHANGE.search(normalized):
        return "topic_change"
    if "```" in normalized or _SELF_CONTAINED.search(normalized):
        return "standalone"
    if _CONTINUATION.search(normalized):
        return "continuation"
    if PREVIOUS_CONVERSATION.search(normalized) or _REFERENTIAL.search(normalized):
        return "referential"
    return "standalone"
