from functools import lru_cache

from supabase import Client, create_client

from app.core.config import settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Reuse the service-role Supabase client for the lifetime of the worker.

    The client is application-scoped and does not carry end-user auth state, so
    recreating it for every service call only adds HTTP/client setup overhead.
    """
    return create_client(
        settings.supabase_url,
        settings.supabase_secret_key,
    )
