#!/usr/bin/env bash
# Download EfficientDet Lite 0 TFLite model for object detection
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/app/src/main/assets"
MODEL_FILE="$ASSETS_DIR/efficientdet_lite0.tflite"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite"

echo "Creating assets directory..."
mkdir -p "$ASSETS_DIR"

if [ -f "$MODEL_FILE" ]; then
    echo "Model already exists at $MODEL_FILE"
    exit 0
fi

echo "Downloading EfficientDet Lite 0 model..."
curl -L -o "$MODEL_FILE" "$MODEL_URL"

echo "Model downloaded to $MODEL_FILE"
echo "File size: $(du -sh "$MODEL_FILE" | cut -f1)"
