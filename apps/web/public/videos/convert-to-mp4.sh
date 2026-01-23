#!/bin/bash
# Convert .MOV videos to .MP4 format for better web compatibility and smaller file sizes
# Optimized for mobile browsers with H.264 codec

cd "$(dirname "$0")"

# Check if ffmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg is not installed."
    echo "Install it with: brew install ffmpeg (macOS) or apt-get install ffmpeg (Linux)"
    exit 1
fi

# Convert each .MOV file to .MP4
for mov_file in *.MOV; do
    if [ -f "$mov_file" ]; then
        # Get filename without extension
        base_name="${mov_file%.MOV}"
        mp4_file="${base_name}.mp4"
        
        echo "Converting $mov_file to $mp4_file..."
        
        # Convert with H.264 codec, optimized for web/mobile
        # -crf 23: Good quality/size balance (lower = better quality, higher = smaller file)
        # -preset medium: Good speed/compression balance
        # -movflags +faststart: Enables progressive download (plays while downloading)
        # -pix_fmt yuv420p: Ensures compatibility with all browsers
        ffmpeg -i "$mov_file" \
            -c:v libx264 \
            -crf 23 \
            -preset medium \
            -movflags +faststart \
            -pix_fmt yuv420p \
            -c:a aac \
            -b:a 128k \
            "$mp4_file"
        
        if [ $? -eq 0 ]; then
            echo "✓ Successfully converted $mov_file to $mp4_file"
            echo "  Original size: $(du -h "$mov_file" | cut -f1)"
            echo "  New size: $(du -h "$mp4_file" | cut -f1)"
        else
            echo "✗ Failed to convert $mov_file"
        fi
        echo ""
    fi
done

echo "Conversion complete!"
echo ""
echo "Next steps:"
echo "1. Verify the .mp4 files play correctly"
echo "2. Update the codebase to reference .mp4 instead of .MOV"
echo "3. Optionally delete the original .MOV files to save space"

