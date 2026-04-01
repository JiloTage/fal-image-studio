from dataclasses import dataclass
from typing import Literal

ModelName = Literal["reve", "seedream", "nano-banana2", "clarity-upscaler"]

@dataclass
class ModelConfig:
    endpoint: str
    image_param: str  # "image_url" or "image_urls"
    description: str

MODELS: dict[str, ModelConfig] = {
    "reve": ModelConfig(
        endpoint="fal-ai/reve/edit",
        image_param="image_url",
        description="Reve image editing model",
    ),
    "seedream": ModelConfig(
        endpoint="fal-ai/bytedance/seedream/v4.5/edit",
        image_param="image_urls",
        description="SeeDream image editing model",
    ),
    "nano-banana2": ModelConfig(
        endpoint="fal-ai/nano-banana-2/edit",
        image_param="image_urls",
        description="Nano Banana 2 image editing model",
    ),
    "clarity-upscaler": ModelConfig(
        endpoint="fal-ai/clarity-upscaler",
        image_param="image_url",
        description="Clarity upscaler model",
    ),
}
