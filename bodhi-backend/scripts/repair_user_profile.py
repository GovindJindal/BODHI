"""
Repair a user profile record that may break client screens (e.g. Voice AI).

Usage:
  python scripts/repair_user_profile.py --email user@example.com
  python scripts/repair_user_profile.py --name "Govind Jindal"
"""
import argparse
import asyncio
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")
if DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")


def sanitize_avatar_url(value: str | None) -> str | None:
    if not value or not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.startswith("http://") or cleaned.startswith("https://") or cleaned.startswith("/"):
        return cleaned
    return None


async def repair_user(email: str | None, full_name: str | None) -> None:
    if not DATABASE_URL:
        print("DATABASE_URL is not configured", file=sys.stderr)
        sys.exit(1)

    engine = create_async_engine(DATABASE_URL)
    async with engine.begin() as conn:
        if email:
            result = await conn.execute(
                text("SELECT id, email, full_name, avatar_url FROM users WHERE lower(email) = lower(:email)"),
                {"email": email},
            )
        else:
            result = await conn.execute(
                text("SELECT id, email, full_name, avatar_url FROM users WHERE lower(full_name) = lower(:name)"),
                {"name": full_name},
            )

        row = result.fetchone()
        if not row:
            print("No matching user found.")
            return

        user_id, user_email, user_full_name, avatar_url = row
        repaired_name = (user_full_name or "").strip() or "User"
        repaired_avatar = sanitize_avatar_url(avatar_url)

        await conn.execute(
            text(
                """
                UPDATE users
                SET full_name = :full_name,
                    avatar_url = :avatar_url,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = :id
                """
            ),
            {
                "id": user_id,
                "full_name": repaired_name,
                "avatar_url": repaired_avatar,
            },
        )

        print("Repaired user:")
        print(f"  id: {user_id}")
        print(f"  email: {user_email}")
        print(f"  full_name: {repaired_name!r}")
        print(f"  avatar_url: {repaired_avatar!r}")

    await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description="Repair corrupt user profile fields.")
    parser.add_argument("--email", help="Target user email")
    parser.add_argument("--name", help="Target user full name")
    args = parser.parse_args()

    if not args.email and not args.name:
        parser.error("Provide --email or --name")

    asyncio.run(repair_user(args.email, args.name))


if __name__ == "__main__":
    main()
