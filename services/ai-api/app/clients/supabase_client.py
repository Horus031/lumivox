from supabase import Client, create_client

from app.core.config import settings


def get_supabase_client() -> Client:
    return create_client(
        settings.supabase_url,
        settings.supabase_secret_key,
    )