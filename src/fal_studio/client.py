import os
import fal_client
from pathlib import Path
from .models import MODELS, ModelName


def _upload_image(image_path: str) -> str:
    """Upload a local image file to fal and return the URL."""
    data = Path(image_path).read_bytes()
    url = fal_client.upload(data, content_type=_guess_content_type(image_path))
    return url


def _guess_content_type(path: str) -> str:
    ext = Path(path).suffix.lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
    }.get(ext, "image/png")


def _resolve_image(image: str) -> str:
    """Return a URL for the given image (path or URL)."""
    if image.startswith("http://") or image.startswith("https://"):
        return image
    return _upload_image(image)


def run_model(
    model: ModelName,
    prompt: str,
    images: list[str] | None = None,
    extra_params: dict | None = None,
) -> dict:
    """Run a fal.ai model and return the raw result dict."""
    config = MODELS[model]
    arguments: dict = {"prompt": prompt}

    if images:
        resolved = [_resolve_image(img) for img in images]
        if config.image_param == "image_urls":
            arguments["image_urls"] = resolved
        else:
            arguments["image_url"] = resolved[0]

    if extra_params:
        arguments.update(extra_params)

    result = fal_client.run(config.endpoint, arguments=arguments)
    return result
