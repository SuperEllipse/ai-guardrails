"""Checksums for profile version 3. Each function returns True when the value is valid."""

from __future__ import annotations

import re


def digits_only(value: str) -> str:
    return re.sub(r"\D", "", value)


def card_luhn(value: str) -> bool:
    number = digits_only(value)
    if not 13 <= len(number) <= 19:
        return False
    total = 0
    reverse = number[::-1]
    for index, char in enumerate(reverse):
        digit = int(char)
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        total += digit
    return total % 10 == 0


def sg_nric(value: str) -> bool:
    """Singapore NRIC / FIN checksum. Prefix plus 7 digits plus a letter."""
    text = value.strip().upper()
    if not re.fullmatch(r"[STFGM]\d{7}[A-Z]", text):
        return False
    weights = (2, 7, 6, 5, 4, 3, 2)
    prefix = text[0]
    offset = {"S": 0, "T": 4, "F": 0, "G": 4, "M": 3}.get(prefix, 0)
    total = offset + sum(int(digit) * weight for digit, weight in zip(text[1:8], weights))
    letters = "JZIHGFEDCBA" if prefix in ("S", "T") else "XWUTRQPNMLK"
    return text[-1] == letters[total % 11]


def au_tfn(value: str) -> bool:
    number = digits_only(value)
    if len(number) != 9:
        return False
    weights = (1, 4, 3, 7, 5, 8, 6, 9, 10)
    total = sum(int(digit) * weight for digit, weight in zip(number, weights))
    return total % 11 == 0


def iban(value: str) -> bool:
    text = re.sub(r"\s+", "", value).upper()
    if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{11,30}", text):
        return False
    rearranged = text[4:] + text[:4]
    numeric = "".join(str(int(char, 36)) if char.isalpha() else char for char in rearranged)
    return int(numeric) % 97 == 1


def aadhaar(value: str) -> bool:
    """Verhoeff checksum used by Aadhaar. Twelve digits, first digit not 0 or 1."""
    number = digits_only(value)
    if not re.fullmatch(r"[2-9]\d{11}", number):
        return False
    multiply = (
        (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
        (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
        (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
        (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
        (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
        (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
        (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
        (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
        (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
        (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
    )
    perm = (
        (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
        (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
        (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
        (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
        (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
        (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
        (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
        (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
    )
    check = 0
    for index, char in enumerate(reversed(number)):
        check = multiply[check][perm[index % 8][int(char)]]
    return check == 0


VALIDATORS = {
    "card_luhn": card_luhn,
    "sg_nric": sg_nric,
    "au_tfn": au_tfn,
    "iban": iban,
    "aadhaar": aadhaar,
}
