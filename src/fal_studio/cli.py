import base64
import json
import os
import sys
from datetime import datetime
from pathlib import Path

import click
from dotenv import load_dotenv

from .client import run_model
from .models import MODELS

load_dotenv()

OUTPUTS_DIR = Path.cwd() / "outputs"


def _decode_card_state(encoded: str) -> dict | None:
    if not encoded:
        return None
    try:
        raw = base64.b64decode(encoded.encode("utf-8"))
        data = json.loads(raw.decode("utf-8"))
    except Exception as error:  # pragma: no cover - surfaced to CLI
        raise click.ClickException(f"Invalid --card-state-b64 payload: {error}") from error

    if not isinstance(data, dict):
        raise click.ClickException("Invalid --card-state-b64 payload: expected a JSON object")
    return data


def _coerce_param_value(value: str):
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    try:
        return int(value)
    except ValueError:
        try:
            return float(value)
        except ValueError:
            return value


def _normalize_extra_params(params: dict) -> dict:
    normalized = {}
    for key, value in params.items():
        if key == "seed":
            continue
        normalized[key] = value
    return normalized


def _save_result(
    model: str,
    prompt: str,
    images: list[str] | None,
    result: dict,
    card_state: dict | None = None,
) -> Path:
    OUTPUTS_DIR.mkdir(exist_ok=True)
    now = datetime.now()
    timestamp_file = now.strftime("%Y%m%d_%H%M%S")
    out_path = OUTPUTS_DIR / f"{model}_{timestamp_file}.json"
    record = {
        "model": model,
        "prompt": prompt,
        "input_images": images or [],
        "timestamp": now.isoformat(),
        "result": result,
    }
    if card_state:
        record["card_state"] = card_state
    out_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return out_path


@click.group()
def cli():
    """fal.ai image generation CLI"""
    pass


@cli.command()
@click.argument("model", type=click.Choice(list(MODELS.keys())))
@click.option("-p", "--prompt", default="", help="Text prompt")
@click.option("-i", "--image", "images", multiple=True, help="Image path or URL (can repeat)")
@click.option("--no-save", is_flag=True, help="Print result only, do not save JSON")
@click.option("--param", "extra", multiple=True, metavar="KEY=VALUE", help="Extra model params")
@click.option("--card-state-b64", default="", help="Base64 encoded card snapshot from the web UI")
def run(model: str, prompt: str, images: tuple, no_save: bool, extra: tuple, card_state_b64: str):
    """Run a model and save the result as JSON."""
    if not os.environ.get("FAL_KEY"):
        click.echo("Error: FAL_KEY not set. Copy .env.example to .env and add your key.", err=True)
        sys.exit(1)

    card_state = _decode_card_state(card_state_b64)
    resolved_model = model
    resolved_prompt = prompt
    resolved_images = list(images)
    extra_params = {}

    if card_state:
        snapshot_model = card_state.get("model")
        if isinstance(snapshot_model, str) and snapshot_model in MODELS:
            resolved_model = snapshot_model

        snapshot_prompt = card_state.get("prompt")
        if isinstance(snapshot_prompt, str):
            resolved_prompt = snapshot_prompt

        snapshot_images = card_state.get("inputImages")
        if not isinstance(snapshot_images, list):
            snapshot_images = card_state.get("input_images")
        if isinstance(snapshot_images, list) and not resolved_images:
            resolved_images = [str(image) for image in snapshot_images if image]

        snapshot_params = card_state.get("params")
        if isinstance(snapshot_params, dict):
            extra_params.update(snapshot_params)

    for kv in extra:
        if "=" not in kv:
            click.echo(f"Error: --param must be KEY=VALUE, got: {kv}", err=True)
            sys.exit(1)
        key, value = kv.split("=", 1)
        extra_params[key] = _coerce_param_value(value)

    extra_params = _normalize_extra_params(extra_params)

    if not resolved_prompt and not resolved_images:
        click.echo("Error: prompt or image input is required.", err=True)
        sys.exit(1)

    click.echo(f"Running {resolved_model}...")
    result = run_model(resolved_model, resolved_prompt, resolved_images or None, extra_params or None)

    if no_save:
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        out_path = _save_result(
            resolved_model,
            resolved_prompt,
            resolved_images or None,
            result,
            card_state=card_state,
        )
        click.echo(f"Saved -> {out_path}")
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))


@cli.command()
def models():
    """List available models."""
    for name, cfg in MODELS.items():
        click.echo(f"  {name:20s}  {cfg.description}")
        click.echo(f"  {'':20s}  endpoint: {cfg.endpoint}")
