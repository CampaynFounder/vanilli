#!/usr/bin/env python3
"""Deploy Modal functions to production.

Usage:
    python modal_app/deploy.py                    # Deploy all functions
    python modal_app/deploy.py --function process_video  # Deploy specific function
    python modal_app/deploy.py --function worker_loop     # Deploy worker loop
    python modal_app/deploy.py --list              # List available functions
"""
import argparse
import subprocess
import sys
from pathlib import Path


# Available Modal functions to deploy
FUNCTIONS = {
    "process_video": {
        "file": "process_video.py",
        "description": "Main video processing endpoint (POST /) - legacy single-chunk",
    },
    "worker_loop": {
        "file": "worker_loop.py",
        "description": "Queue worker loop (scheduled, runs every 10s)",
    },
    "media_analyzer": {
        "file": "media_analyzer.py",
        "description": "Media analyzer service (librosa BPM + audalign sync offset)",
    },
}


def find_modal_cli():
    """Find Modal CLI command."""
    for cmd in ["modal", "python3 -m modal", "python -m modal"]:
        try:
            if " " in cmd:
                parts = cmd.split()
                result = subprocess.run(
                    parts + ["--help"],
                    capture_output=True,
                    timeout=5,
                )
            else:
                result = subprocess.run(
                    [cmd, "--help"],
                    capture_output=True,
                    timeout=5,
                )
            if result.returncode == 0:
                return cmd.split() if " " in cmd else [cmd]
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return None


def check_modal_auth():
    """Check if Modal is authenticated."""
    modal_cmd = find_modal_cli()
    if not modal_cmd:
        return False
    
    try:
        result = subprocess.run(
            modal_cmd + ["app", "list"],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False


def deploy_function(function_name: str, repo_root: Path) -> bool:
    """Deploy a single Modal function.
    
    Returns:
        True if deployment succeeded, False otherwise
    """
    if function_name not in FUNCTIONS:
        print(f"Error: Unknown function '{function_name}'")
        print(f"Available functions: {', '.join(FUNCTIONS.keys())}")
        return False
    
    func_info = FUNCTIONS[function_name]
    func_file = repo_root / "modal_app" / func_info["file"]
    
    if not func_file.exists():
        print(f"Error: Function file not found: {func_file}")
        return False
    
    modal_cmd = find_modal_cli()
    if not modal_cmd:
        print("Error: Modal CLI not found.")
        print("\nInstall Modal:")
        print("  pip install modal")
        print("  # or: uv pip install modal")
        print("\nThen authenticate:")
        print("  modal setup")
        print("\nDocs: https://modal.com/docs/guide/install")
        return False
    
    print(f"\n{'='*60}")
    print(f"Deploying: {function_name}")
    print(f"File: {func_file}")
    print(f"Description: {func_info['description']}")
    print(f"{'='*60}\n")
    
    try:
        result = subprocess.run(
            modal_cmd + ["deploy", str(func_file)],
            cwd=str(repo_root),
            check=False,
        )
        
        if result.returncode == 0:
            print(f"\n✅ Successfully deployed {function_name}")
            return True
        else:
            print(f"\n❌ Failed to deploy {function_name}")
            return False
    except Exception as e:
        print(f"\n❌ Error deploying {function_name}: {e}")
        return False


def list_functions():
    """List all available functions."""
    print("Available Modal functions:\n")
    for name, info in FUNCTIONS.items():
        print(f"  {name:20} - {info['description']}")
        print(f"  {'':20}   File: {info['file']}\n")


def main():
    """Main deployment script."""
    parser = argparse.ArgumentParser(
        description="Deploy Modal functions to production",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python modal_app/deploy.py                    # Deploy all functions
  python modal_app/deploy.py --function process_video
  python modal_app/deploy.py --function worker_loop
  python modal_app/deploy.py --list             # List available functions
        """,
    )
    parser.add_argument(
        "--function",
        "-f",
        choices=list(FUNCTIONS.keys()),
        help="Deploy specific function (default: all)",
    )
    parser.add_argument(
        "--list",
        "-l",
        action="store_true",
        help="List available functions and exit",
    )
    
    args = parser.parse_args()
    
    # Find repo root (directory containing modal_app/)
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    
    if args.list:
        list_functions()
        return 0
    
    # Check Modal CLI
    modal_cmd = find_modal_cli()
    if not modal_cmd:
        print("Error: Modal CLI not found.")
        print("\nInstall Modal:")
        print("  pip install modal")
        print("  # or: uv pip install modal")
        print("\nThen authenticate:")
        print("  modal setup")
        print("\nDocs: https://modal.com/docs/guide/install")
        return 1
    
    # Check authentication
    if not check_modal_auth():
        print("Warning: Modal authentication check failed.")
        print("Make sure you've run: modal setup")
        response = input("Continue anyway? (y/N): ")
        if response.lower() != "y":
            return 1
    
    # Deploy functions
    functions_to_deploy = [args.function] if args.function else list(FUNCTIONS.keys())
    
    print(f"\n🚀 Deploying {len(functions_to_deploy)} function(s) to Modal...\n")
    
    results = {}
    for func_name in functions_to_deploy:
        results[func_name] = deploy_function(func_name, repo_root)
    
    # Summary
    print(f"\n{'='*60}")
    print("Deployment Summary:")
    print(f"{'='*60}")
    
    all_success = True
    for func_name, success in results.items():
        status = "✅ Success" if success else "❌ Failed"
        print(f"  {func_name:20} - {status}")
        if not success:
            all_success = False
    
    if all_success:
        print(f"\n✅ All deployments completed successfully!")
        print("\nNext steps:")
        print("  1. Copy the deployed URLs from the output above")
        print("  2. Set NEXT_PUBLIC_MODAL_PROCESS_VIDEO_URL in your .env")
        print("  3. Run database migrations if needed:")
        print("     - packages/database/add-video-jobs-table.sql (for worker_loop)")
        return 0
    else:
        print(f"\n❌ Some deployments failed. Check the errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
