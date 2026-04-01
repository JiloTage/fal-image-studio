import { C } from "./theme";

export const AI_MODELS = [
  {
    id: "reve",
    name: "Reve Edit",
    icon: "\u25C6",
    color: C.green,
    endpoint: "fal-ai/reve/edit",
    imageParam: "image_url",
    params: [
      { key: "num_images", label: "Images", type: "slider", min: 1, max: 4, step: 1, default: 1 },
    ],
  },
  {
    id: "seedream",
    name: "SeeDream Edit",
    icon: "\u25C7",
    color: C.cyan,
    endpoint: "fal-ai/bytedance/seedream/v4.5/edit",
    imageParam: "image_urls",
    params: [
      { key: "num_images", label: "Images", type: "slider", min: 1, max: 4, step: 1, default: 1 },
      { key: "image_size", label: "Size", type: "select", options: ["auto_2K", "auto_4K", "square_hd", "square", "portrait_4_3", "landscape_4_3"], default: "auto_2K" },
      { key: "seed", label: "Seed", type: "number", default: -1 },
      { key: "enable_safety_checker", label: "Safety", type: "bool", default: false },
    ],
  },
  {
    id: "nano-banana2",
    name: "Nano Banana 2",
    icon: "\u25CB",
    color: C.purple,
    endpoint: "fal-ai/nano-banana-2/edit",
    imageParam: "image_urls",
    params: [
      { key: "num_images", label: "Images", type: "slider", min: 1, max: 4, step: 1, default: 1 },
      { key: "resolution", label: "Resolution", type: "select", options: ["0.5K", "1K", "2K", "4K"], default: "1K" },
      { key: "aspect_ratio", label: "Aspect", type: "select", options: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"], default: "auto" },
      { key: "seed", label: "Seed", type: "number", default: -1 },
    ],
  },
  {
    id: "clarity-upscaler",
    name: "Clarity Upscaler",
    icon: "\u25CE",
    color: C.orange,
    endpoint: "fal-ai/clarity-upscaler",
    imageParam: "image_url",
    params: [
      { key: "upscale_factor", label: "Scale", type: "slider", min: 1, max: 4, step: 0.5, default: 2 },
      { key: "creativity", label: "Creativity", type: "slider", min: 0, max: 1, step: 0.05, default: 0.35 },
      { key: "resemblance", label: "Resemblance", type: "slider", min: 0, max: 1, step: 0.05, default: 0.6 },
      { key: "guidance_scale", label: "CFG", type: "slider", min: 0, max: 20, step: 0.5, default: 4 },
      { key: "num_inference_steps", label: "Steps", type: "slider", min: 4, max: 50, step: 1, default: 18 },
      { key: "seed", label: "Seed", type: "number", default: -1 },
      { key: "enable_safety_checker", label: "Safety", type: "bool", default: false },
    ],
  },
];
