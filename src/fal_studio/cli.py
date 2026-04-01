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


def _save_result(model: str, prompt: str, images: list[str] | None, result: dict) -> Path:
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
    out_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    return out_path


@click.group()
def cli():
    """fal.ai image generation CLI"""
    pass


@cli.command()
@click.argument("model", type=click.Choice(list(MODELS.keys())))
@click.option("-p", "--prompt", required=True, help="Text prompt")
@click.option("-i", "--image", "images", multiple=True, help="Image path or URL (can repeat)")
@click.option("--no-save", is_flag=True, help="Print result only, do not save JSON")
@click.option("--param", "extra", multiple=True, metavar="KEY=VALUE", help="Extra model params")
def run(model: str, prompt: str, images: tuple, no_save: bool, extra: tuple):
    """Run a model and save the result as JSON."""
    if not os.environ.get("FAL_KEY"):
        click.echo("Error: FAL_KEY not set. Copy .env.example to .env and add your key.", err=True)
        sys.exit(1)

    extra_params = {}
    for kv in extra:
        if "=" not in kv:
            click.echo(f"Error: --param must be KEY=VALUE, got: {kv}", err=True)
            sys.exit(1)
        k, v = kv.split("=", 1)
        # auto-convert numeric values
        try:
            v = int(v)
        except ValueError:
            try:
                v = float(v)
            except ValueError:
                pass
        extra_params[k] = v

    click.echo(f"Running {model}...")
    result = run_model(model, prompt, list(images) or None, extra_params or None)

    if no_save:
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        out_path = _save_result(model, prompt, list(images) or None, result)
        click.echo(f"Saved → {out_path}")
        click.echo(json.dumps(result, indent=2, ensure_ascii=False))


@cli.command()
def models():
    """List available models."""
    for name, cfg in MODELS.items():
        click.echo(f"  {name:20s}  {cfg.description}")
        click.echo(f"  {'':20s}  endpoint: {cfg.endpoint}")
