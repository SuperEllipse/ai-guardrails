"""Read-only view of the regional ID profiles and what each version changes."""

from __future__ import annotations

from typing import Any

from src.guardrails.pii_screen import load_profiles

NOTES = {
    "CARD": "A run of 13 to 16 digits. Versions 1 and 2 treat that shape as a card. Version 3 keeps it only when the card checksum is valid. No nearby word is required.",
    "EMAIL": "An address with a name, an @ sign, and a domain. There is no nearby word and no checksum, so every version blocks it the same way.",
    "PHONE": "A phone-shaped run of digits. Version 1 blocks the shape alone. Versions 2 and 3 also require the words phone, mobile, or call nearby. There is no checksum.",
    "OTP": "Any six digits. Version 1 blocks the number alone. Versions 2 and 3 also require otp, one-time, or passcode nearby.",
    "SG_NRIC": "A letter S, T, F, G, or M, seven digits, and a check letter. Version 1 blocks the shape. Version 2 also needs nric, fin, or identity nearby. Version 3 also requires a valid NRIC checksum, so a lookalike such as S1234567A is allowed.",
    "SG_UEN": "Eight or nine digits and a letter. Version 2 also needs uen or unique entity nearby. This demo does not check a UEN checksum.",
    "AU_TFN": "Nine digits, often written in groups of three. Version 2 also needs tfn or tax file nearby. Version 3 also requires the tax file number checksum.",
    "AU_MEDICARE": "Four digits, five digits, and a final digit. Version 2 also needs the word medicare nearby. There is no checksum.",
    "AU_ABN": "An eleven-digit business number. Version 2 also needs abn, acn, or business number nearby. There is no checksum.",
    "US_SSN": "Three digits, a hyphen, two digits, a hyphen, and four digits. Version 2 also needs ssn or social security nearby. There is no checksum, so version 3 matches version 2.",
    "US_ITIN": "The same shape as a Social Security number, starting with 9. Version 2 also needs the word itin nearby. There is no checksum.",
    "US_BANK": "Eight to twelve digits. Version 1 blocks many ordinary numbers of that length. Version 2 also needs account, routing, or bank nearby.",
    "IN_AADHAAR": "Twelve digits, not starting with 0 or 1. Version 2 also needs aadhaar or uidai nearby. Version 3 also requires the Aadhaar checksum.",
    "IN_PAN": "Five letters, four digits, and a letter. Version 2 also needs pan or permanent account nearby. There is no checksum.",
    "EU_IBAN": "Two letters, two digits, then 11 to 30 letters or digits. Version 2 also needs iban or account nearby. Version 3 also requires the IBAN checksum.",
    "ES_NIF": "Eight digits and a letter, or X, Y, or Z, seven digits, and a letter. Version 2 also needs nif, nie, or dni nearby. There is no checksum.",
    "PL_PESEL": "Eleven digits. Version 1 blocks many numbers of that length. Version 2 also needs the word pesel nearby.",
    "IT_FISCAL": "The shape of an Italian fiscal code. Version 2 also needs fiscal or codice nearby. There is no checksum.",
}

VERSIONS = [
    {
        "id": "v1",
        "name": "Version 1, pattern",
        "comment": "The check blocks anything that has the shape of an ID. Nearby words and checksums are ignored. This catches the most, including ordinary numbers that only look like an ID.",
    },
    {
        "id": "v2",
        "name": "Version 2, nearby word",
        "comment": "The same shape must sit next to a word that names it, such as NRIC or social security. An ID with no nearby word is allowed. Email has no word list, so an email is still blocked.",
    },
    {
        "id": "v3",
        "name": "Version 3, checksum",
        "comment": "Version 2, plus the official check digit where this demo has one. A number that looks right but fails the math is allowed. A Social Security number has no checksum here, so version 3 treats it like version 2.",
    },
]


def _entity(entity: dict[str, Any]) -> dict[str, Any]:
    entity_id = str(entity.get("id") or "")
    context = [str(word) for word in (entity.get("context") or [])]
    validator = str(entity.get("validator") or "")
    return {
        "id": entity_id,
        "label": entity.get("label") or entity_id,
        "pattern": entity.get("pattern") or "",
        "context": context,
        "checksum": bool(validator),
        "comment": NOTES.get(
            entity_id,
            "Version 1 uses the pattern alone."
            + (" Version 2 also requires a nearby word." if context else "")
            + (" Version 3 also requires the checksum." if validator else ""),
        ),
    }


def profile_catalog() -> dict[str, Any]:
    profiles = []
    for profile in load_profiles("US", all_regions=True):
        # load_profiles(all_regions) already includes global.yml.
        profile_id = str(profile.get("id") or "")
        name = "Every region" if profile_id == "global" else (profile.get("name") or profile_id)
        profiles.append(
            {
                "id": profile_id,
                "name": name,
                "entities": [_entity(entity) for entity in (profile.get("entities") or [])],
            }
        )
    # The helper prepends global and then every region file. Keep that order,
    # but do not list the home region twice. all_regions already includes US.
    seen: set[str] = set()
    unique = []
    for profile in profiles:
        if profile["id"] in seen:
            continue
        seen.add(profile["id"])
        unique.append(profile)
    return {"versions": VERSIONS, "profiles": unique}
