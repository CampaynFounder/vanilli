#!/usr/bin/env python3
"""
Generate the same JWT that process_video.py uses for Kling, so you can verify
auth before redeploying. Uses KLING_ACCESS_KEY and KLING_API_KEY (or KLING_SECRET_KEY)
from the environment.

Usage:
  export KLING_ACCESS_KEY="your-access-key"
  export KLING_API_KEY="your-secret-key"
  python3 modal_app/gen_kling_jwt.py

Or inline:
  KLING_ACCESS_KEY=ak_xxx KLING_API_KEY=sk_xxx python3 modal_app/gen_kling_jwt.py
"""
import json
import sys
import time

try:
    import jwt
except ImportError:
    print("Install pyjwt: pip install pyjwt", file=sys.stderr)
    sys.exit(1)

def main():
    access = __import__("os").environ.get("KLING_ACCESS_KEY")
    secret = __import__("os").environ.get("KLING_SECRET_KEY") or __import__("os").environ.get("KLING_API_KEY")

    if not access or not secret:
        print("Set KLING_ACCESS_KEY and KLING_API_KEY (or KLING_SECRET_KEY) in the environment.", file=sys.stderr)
        print("Example: KLING_ACCESS_KEY=ak_xxx KLING_API_KEY=sk_xxx python3 modal_app/gen_kling_jwt.py", file=sys.stderr)
        sys.exit(1)

    iat = int(time.time())
    payload = {"ak": access, "iat": iat, "exp": iat + 3600}
    tok = jwt.encode(payload, secret, algorithm="HS256")
    token = tok.decode("utf-8") if isinstance(tok, bytes) else tok

    # Decode without verify to show payload (we don't print the raw 'ak' value)
    decoded = jwt.decode(token, options={"verify_signature": False})
    ak = decoded.get("ak", "")
    ak_display = f"{str(ak)[:8]}...{str(ak)[-4:]}" if len(str(ak)) > 12 else "***"
    decoded_redacted = {"ak": ak_display, "iat": decoded["iat"], "exp": decoded["exp"]}

    print("JWT (use as Authorization: Bearer <token>):")
    print(token)
    print()
    print("Payload (ak redacted):", json.dumps(decoded_redacted))
    print("Expires in: 3600s (~1h)")
    print()
    print("Test with curl (paste the JWT above as <JWT>; use real signed URLs for driver_video and target_image):")
    print('  curl -s -X POST "https://api.klingai.com/v1/videos/motion-control" \\')
    print('    -H "Content-Type: application/json" \\')
    print('    -H "Authorization: Bearer <JWT>" \\')
    print('    -d \'{"model_name":"kling-v2","driver_video_url":"<DRIVER_VIDEO_URL>","target_image_url":"<TARGET_IMAGE_URL>","mode":"standard","character_orientation":"image"}\'')

if __name__ == "__main__":
    main()
