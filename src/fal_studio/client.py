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


def _resolve_endpoint(config, images: list[str] | None) -> tuple[str, list[str]]:
    resolved_images = images or []
    if resolved_images and config.supports_images and config.image_endpoint:
        return config.image_endpoint, resolved_images
    if config.text_endpoint:
        return config.text_endpoint, []
    if config.image_endpoint:
        return config.image_endpoint, resolved_images
    raise ValueError("Model config has no usable endpoint")


def run_model(
    model: ModelName,
    prompt: str | None = None,
    images: list[str] | None = None,
    extra_params: dict | None = None,
) -> dict:
    """Run a fal.ai model and return the raw result dict."""
    config = MODELS[model]
    endpoint, selected_images = _resolve_endpoint(config, images)
    arguments: dict = dict(config.base_arguments)

    if prompt:
        arguments["prompt"] = prompt

    if selected_images and config.image_param:
        resolved = [_resolve_image(img) for img in selected_images]
        if config.image_param == "image_urls":
            arguments["image_urls"] = resolved
        else:
            arguments["image_url"] = resolved[0]

    if extra_params:
        arguments.update(_prepare_extra_params(extra_params))

    result = fal_client.run(endpoint, arguments=arguments)
    return result


def _prepare_extra_params(extra_params: dict) -> dict:
    params = dict(extra_params)
    lora_path = str(params.pop("lora_path", "") or "").strip()
    lora_scale = params.pop("lora_scale", 0.8)
    try:
        lora_scale = float(lora_scale)
    except (TypeError, ValueError):
        lora_scale = 0.8

    if lora_path:
        params["loras"] = [{
            "path": lora_path,
            "scale": lora_scale,
        }]

    return params
