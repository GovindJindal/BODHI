import asyncio
import os
import sys
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

# ─── 1. PATH SETUP ─────────────────────────────────────────────────────────────
# This ensures Alembic can find your app modules (database, models, etc.)
sys.path.append(os.path.dirname(os.path.dirname(__file__)))

# ─── 2. IMPORT BASE & ALL MODELS ───────────────────────────────────────────────
# We MUST import Base first, and then explicitly import every single file 
# that contains database models so Alembic knows they exist.
from database import Base

import models.core
import models.expenses
import models.payments
import models.portfolio
import models.social
import models.wallets

# ─── 3. SET TARGET METADATA ────────────────────────────────────────────────────
# This tells Alembic to look at the combined state of all the files imported above.
target_metadata = Base.metadata

# ─── 4. ALEMBIC CONFIGURATION ──────────────────────────────────────────────────
# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Run the actual migrations using the provided connection."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an AsyncEngine
    and associate it with the context.
    """
    # Prioritize environment variable if present
    db_url = os.getenv("DATABASE_URL")
    configuration = config.get_section(config.config_ini_section, {})
    if db_url:
        configuration["sqlalchemy.url"] = db_url

    connect_args = {}
    if db_url and "sslmode=require" in db_url:
        import ssl
        ssl_context = ssl.create_default_context()
        connect_args["ssl"] = ssl_context
        db_url = db_url.replace("?sslmode=require", "").replace("&sslmode=require", "")
        configuration["sqlalchemy.url"] = db_url

    connectable = async_engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()