from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .database import AsyncSessionLocal, engine
from .ingestion import normalize_answer
from .models import Category, CategoryTranslation, Question, QuestionDecoy


QUESTIONS_DIRECTORY = Path(__file__).resolve().parents[1] / "data" / "questions"
REQUIRED_FIELDS = {
    "category_id",
    "language_code",
    "question_text",
    "correct_answer",
    "decoys",
}

# These IDs belong to the JSON source. They are mapped to database IDs at run time.
CATEGORY_SEEDS: dict[int, dict[str, Any]] = {
    1: {
        "image_url": "/images/science.webp",
        "translations": {
            "en": "Science",
            "ar": "العلوم",
        },
    },
    2: {
        "image_url": "/images/history.webp",
        "translations": {
            "en": "History",
            "ar": "التاريخ",
        },
    },
    3: {
        "image_url": "/images/geography.webp",
        "translations": {
            "en": "Geography",
            "ar": "الجغرافيا",
        },
    },
    4: {
        "image_url": "/images/sports.webp",
        "translations": {
            "en": "Sports",
            "ar": "الرياضة",
        },
    },
    5: {
        "image_url": "/images/art_literature.webp",
        "translations": {
            "en": "Art & Literature",
            "ar": "الفن والأدب",
        },
    },
    6: {
        "image_url": "/images/technology.webp",
        "translations": {
            "en": "Technology",
            "ar": "التكنولوجيا",
        },
    },
    7: {
        "image_url": "/images/animals_nature.webp",
        "translations": {
            "en": "Animals & Nature",
            "ar": "الحيوانات والطبيعة",
        },
    },
    8: {
        "image_url": "/images/anime.webp",
        "translations": {
            "en": "Anime",
            "ar": "الأنمي",
        },
    },
    9: {
        "image_url": "/images/movies_tv.webp",
        "translations": {
            "en": "Movies & TV",
            "ar": "الأفلام والتلفزيون",
        },
    },
    10: {
        "image_url": "/images/gaming.webp",
        "translations": {
            "en": "Gaming",
            "ar": "ألعاب الفيديو",
        },
    },
    11: {
        "image_url": "/images/weird_facts.webp",
        "translations": {
            "en": "Weird Facts",
            "ar": "حقائق غريبة",
        },
    },
    12: {
        "image_url": "/images/islamic_knowledge.webp",
        "translations": {
            "en": "Islamic Knowledge",
            "ar": "الثقافة الإسلامية",
        },
    },
}

LANGUAGE_CODE_MAX_LENGTH = Question.__table__.c.language_code.type.length
QUESTION_TEXT_MAX_LENGTH = Question.__table__.c.question_text.type.length
ANSWER_MAX_LENGTH = Question.__table__.c.correct_answer.type.length
CATEGORY_NAME_MAX_LENGTH = CategoryTranslation.__table__.c.name.type.length


@dataclass(frozen=True)
class SeedQuestion:
    source_category_id: int
    language_code: str
    question_text: str
    correct_answer: str
    decoys: tuple[str, str, str]
    image_url: str | None


def _location(path: Path, item_number: int) -> str:
    return f"{path.name}, item {item_number}"


def _required_text(
    item: dict[str, Any],
    field: str,
    maximum_length: int,
    location: str,
) -> str:
    value = item[field]

    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{location}: {field} must be a non-empty string")

    cleaned = value.strip()
    if len(cleaned) > maximum_length:
        raise ValueError(
            f"{location}: {field} exceeds {maximum_length} characters"
        )

    return cleaned


def validate_question(
    item: Any,
    path: Path,
    item_number: int,
) -> SeedQuestion:
    location = _location(path, item_number)

    if not isinstance(item, dict):
        raise ValueError(f"{location}: each question must be a JSON object")

    missing_fields = REQUIRED_FIELDS - item.keys()
    if missing_fields:
        raise ValueError(
            f"{location}: missing required fields: {sorted(missing_fields)}"
        )

    source_category_id = item["category_id"]
    if type(source_category_id) is not int or source_category_id not in CATEGORY_SEEDS:
        raise ValueError(
            f"{location}: unsupported category_id: {source_category_id!r}"
        )

    language_code = item["language_code"]
    if not isinstance(language_code, str) or not language_code.strip():
        raise ValueError(f"{location}: language_code must be a non-empty string")

    language_code = language_code.strip()
    supported_languages = CATEGORY_SEEDS[source_category_id]["translations"]
    if language_code not in supported_languages:
        raise ValueError(
            f"{location}: unsupported language_code: {language_code!r}"
        )
    if len(language_code) > LANGUAGE_CODE_MAX_LENGTH:
        raise ValueError(
            f"{location}: language_code exceeds "
            f"{LANGUAGE_CODE_MAX_LENGTH} characters"
        )

    question_text = _required_text(
        item,
        "question_text",
        QUESTION_TEXT_MAX_LENGTH,
        location,
    )
    if not normalize_answer(question_text):
        raise ValueError(
            f"{location}: question_text is empty after normalization"
        )

    correct_answer = _required_text(
        item,
        "correct_answer",
        ANSWER_MAX_LENGTH,
        location,
    )

    raw_decoys = item["decoys"]
    if not isinstance(raw_decoys, list) or len(raw_decoys) != 3:
        raise ValueError(f"{location}: decoys must contain exactly 3 answers")

    decoys: list[str] = []
    for decoy_number, decoy in enumerate(raw_decoys, start=1):
        if not isinstance(decoy, str) or not decoy.strip():
            raise ValueError(
                f"{location}: decoy {decoy_number} must be a non-empty string"
            )

        cleaned_decoy = decoy.strip()
        if len(cleaned_decoy) > ANSWER_MAX_LENGTH:
            raise ValueError(
                f"{location}: decoy {decoy_number} exceeds "
                f"{ANSWER_MAX_LENGTH} characters"
            )
        decoys.append(cleaned_decoy)

    answers = [correct_answer, *decoys]
    normalized_answers = [normalize_answer(answer) for answer in answers]
    if any(not answer for answer in normalized_answers):
        raise ValueError(f"{location}: an answer is empty after normalization")
    if len(set(normalized_answers)) != len(normalized_answers):
        raise ValueError(
            f"{location}: correct_answer and decoys must all be different"
        )

    image_url = item.get("image_url")
    if image_url is not None and not isinstance(image_url, str):
        raise ValueError(f"{location}: image_url must be a string or null")
    if isinstance(image_url, str):
        image_url = image_url.strip() or None

    return SeedQuestion(
        source_category_id=source_category_id,
        language_code=language_code,
        question_text=question_text,
        correct_answer=correct_answer,
        decoys=(decoys[0], decoys[1], decoys[2]),
        image_url=image_url,
    )


def load_questions() -> list[SeedQuestion]:
    if not QUESTIONS_DIRECTORY.is_dir():
        raise FileNotFoundError(
            f"Questions directory does not exist: {QUESTIONS_DIRECTORY}"
        )

    # glob() is deliberately non-recursive, so files under drafts/ are ignored.
    question_files = sorted(QUESTIONS_DIRECTORY.glob("*.json"))
    if not question_files:
        raise FileNotFoundError(
            f"No question JSON files found in: {QUESTIONS_DIRECTORY}"
        )

    questions: list[SeedQuestion] = []
    for path in question_files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid JSON in {path.name}: {error}") from error

        if not isinstance(data, list):
            raise ValueError(f"{path.name}: the top-level value must be a list")

        for item_number, item in enumerate(data, start=1):
            questions.append(validate_question(item, path, item_number))

    return questions


def validate_category_seeds() -> None:
    for source_id, seed in CATEGORY_SEEDS.items():
        translations = seed["translations"]

        if type(source_id) is not int:
            raise ValueError(f"Invalid source category ID: {source_id!r}")
        if not translations:
            raise ValueError(f"Category {source_id} has no translations")

        for language_code, name in translations.items():
            if not language_code or len(language_code) > LANGUAGE_CODE_MAX_LENGTH:
                raise ValueError(
                    f"Category {source_id} has an invalid language code: "
                    f"{language_code!r}"
                )
            if not name or len(name) > CATEGORY_NAME_MAX_LENGTH:
                raise ValueError(
                    f"Category {source_id} has an invalid translation: {name!r}"
                )


async def seed_categories(session: AsyncSession) -> dict[int, int]:
    category_id_map: dict[int, int] = {}

    for source_id, seed in CATEGORY_SEEDS.items():
        translations: dict[str, str] = seed["translations"]
        canonical_matches = (
            await session.scalars(
                select(CategoryTranslation).where(
                    or_(
                        *(
                            (CategoryTranslation.language_code == language_code)
                            & (CategoryTranslation.name == name)
                            for language_code, name in translations.items()
                        )
                    )
                )
            )
        ).all()
        matching_category_ids = {
            translation.category_id for translation in canonical_matches
        }

        if len(matching_category_ids) > 1:
            raise ValueError(
                f"Category {source_id} translations belong to different categories"
            )

        if matching_category_ids:
            category_id = matching_category_ids.pop()
            category = await session.get(Category, category_id)
            if category is None:
                raise ValueError(f"Category {category_id} no longer exists")
            category.image_url = seed["image_url"]
        else:
            category = Category(image_url=seed["image_url"])
            session.add(category)
            await session.flush()
            category_id = category.id

        category_id_map[source_id] = category_id

        for language_code, name in translations.items():
            translation = await session.get(
                CategoryTranslation,
                (category_id, language_code),
            )
            if translation is None:
                session.add(
                    CategoryTranslation(
                        category_id=category_id,
                        language_code=language_code,
                        name=name,
                    )
                )
            else:
                translation.name = name

        await session.flush()

    return category_id_map


async def seed_questions(
    session: AsyncSession,
    questions: list[SeedQuestion],
    category_id_map: dict[int, int],
) -> tuple[int, int]:
    existing_rows = (
        await session.execute(
            select(
                Question.category_id,
                Question.language_code,
                Question.question_text,
            )
        )
    ).all()
    existing_questions: dict[tuple[int, str], set[str]] = {}

    for category_id, language_code, question_text in existing_rows:
        existing_questions.setdefault((category_id, language_code), set()).add(
            normalize_answer(question_text)
        )

    inserted = 0
    skipped = 0

    for item in questions:
        category_id = category_id_map[item.source_category_id]
        group = (category_id, item.language_code)
        normalized_question = normalize_answer(item.question_text)
        group_questions = existing_questions.setdefault(group, set())

        if normalized_question in group_questions:
            skipped += 1
            continue

        session.add(
            Question(
                category_id=category_id,
                language_code=item.language_code,
                question_text=item.question_text,
                correct_answer=item.correct_answer,
                image_url=item.image_url,
                decoys=[
                    QuestionDecoy(decoy_text=decoy) for decoy in item.decoys
                ],
            )
        )
        group_questions.add(normalized_question)
        inserted += 1

    await session.flush()
    return inserted, skipped


async def main() -> None:
    validate_category_seeds()
    questions = load_questions()

    async with AsyncSessionLocal.begin() as session:
        category_id_map = await seed_categories(session)
        inserted, skipped = await seed_questions(
            session,
            questions,
            category_id_map,
        )

    print(f"Question files loaded: {len(questions)}")
    print(f"Categories ready: {len(category_id_map)}")
    print(f"Questions inserted: {inserted}")
    print(f"Questions already present: {skipped}")


async def run() -> None:
    try:
        await main()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(run())
