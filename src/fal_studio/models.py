from dataclasses import dataclass
from typing import Literal

ModelName = Literal["reve", "seedream", "nano-banana2", "clarity-upscaler", "illustrious"]

@dataclass
class ModelConfig:
    text_endpoint: str | None
    image_endpoint: str | None
    image_param: Literal["image_url", "image_urls"] | None
    supports_images: bool
    requires_prompt: bool
    base_arguments: dict
    description: str

MODELS: dict[str, ModelConfig] = {
    "reve": ModelConfig(
        text_endpoint="fal-ai/reve/text-to-image",
        image_endpoint="fal-ai/reve/edit",
        image_param="image_url",
        supports_images=True,
        requires_prompt=True,
        base_arguments={},
        description="Reve text-to-image with automatic edit routing when an image is provided",
    ),
    "seedream": ModelConfig(
        text_endpoint="fal-ai/bytedance/seedream/v4.5/text-to-image",
        image_endpoint="fal-ai/bytedance/seedream/v4.5/edit",
        image_param="image_urls",
        supports_images=True,
        requires_prompt=True,
        base_arguments={},
        description="SeeDream 4.5 text-to-image with automatic edit routing when images are provided",
    ),
    "nano-banana2": ModelConfig(
        text_endpoint="fal-ai/nano-banana-2",
        image_endpoint="fal-ai/nano-banana-2/edit",
        image_param="image_urls",
        supports_images=True,
        requires_prompt=True,
        base_arguments={},
        description="Nano Banana 2 text-to-image with automatic edit routing when images are provided",
    ),
    "clarity-upscaler": ModelConfig(
        text_endpoint=None,
        image_endpoint="fal-ai/clarity-upscaler",
        image_param="image_url",
        supports_images=True,
        requires_prompt=False,
        base_arguments={},
        description="Clarity upscaler model",
    ),
    "illustrious": ModelConfig(
        text_endpoint="fal-ai/lora",
        image_endpoint="fal-ai/lora/image-to-image",
        image_param="image_url",
        supports_images=True,
        requires_prompt=True,
        base_arguments={"model_name": "Bercraft/Illustrious-XL-v2.0-Stable-FP16-Diffusers"},
        description="Illustrious XL with automatic text-to-image or image-to-image routing",
    ),
}
