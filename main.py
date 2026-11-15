"""Gemini Workspace Assistant CLI.

Interactive CLI application demonstrating modern Google Gemini API features:
- Interactive Multi-Turn Chat with streaming & server-side memory
- Multimodal File & Image Analysis
- Structured Pydantic Code & Document Review
"""

import argparse
import sys
from typing import Optional

try:
    from rich.console import Console
    from rich.markdown import Markdown
    from rich.panel import Panel
    from rich.table import Table
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False
    console = None

from gemini_service import GeminiService, CodeReviewResult, DEFAULT_MODEL


def print_info(text: str) -> None:
    if HAS_RICH:
        console.print(f"[bold cyan]ℹ[/bold cyan] {text}")
    else:
        print(f"[i] {text}")


def print_error(text: str) -> None:
    if HAS_RICH:
        console.print(f"[bold red]✖ Error:[/bold red] {text}")
    else:
        print(f"Error: {text}")


def cmd_ask(args: argparse.Namespace, service: GeminiService) -> None:
    """Handle one-off question."""
    prompt = " ".join(args.query)
    print_info(f"Querying [bold]{args.model}[/bold]...")
    try:
        last_id = None
        for chunk, interaction_id in service.stream_generate(prompt, model=args.model):
            if chunk:
                sys.stdout.write(chunk)
                sys.stdout.flush()
            if interaction_id:
                last_id = interaction_id
        sys.stdout.write("\n")
    except Exception as e:
        print_error(str(e))


def cmd_chat(args: argparse.Namespace, service: GeminiService) -> None:
    """Handle multi-turn interactive chat."""
    if HAS_RICH:
        console.print(
            Panel.fit(
                "[bold green]Gemini Interactive Terminal Chat[/bold green]\n"
                f"Model: [cyan]{args.model}[/cyan] | Type [bold yellow]exit[/bold yellow] or [bold yellow]quit[/bold yellow] to finish.\n"
                "Stateful memory enabled across turns using Gemini Interactions API.",
                title="✨ Gemini Assistant",
            )
        )
    else:
        print(f"=== Gemini Interactive Chat ({args.model}) ===")
        print("Type 'exit' or 'quit' to end.\n")

    previous_id: Optional[str] = None

    while True:
        try:
            prompt = input("\nYou > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting chat.")
            break

        if not prompt:
            continue
        if prompt.lower() in {"exit", "quit", ":q"}:
            print("Session ended. Goodbye!")
            break

        sys.stdout.write("\nGemini > ")
        sys.stdout.flush()

        try:
            for chunk, interaction_id in service.stream_generate(
                prompt,
                model=args.model,
                previous_interaction_id=previous_id,
            ):
                if chunk:
                    sys.stdout.write(chunk)
                    sys.stdout.flush()
                if interaction_id:
                    previous_id = interaction_id
            sys.stdout.write("\n")
        except Exception as e:
            print_error(f"Interaction error: {e}")


def cmd_analyze(args: argparse.Namespace, service: GeminiService) -> None:
    """Analyze a file or image."""
    print_info(f"Analyzing [bold]{args.file}[/bold] with model [cyan]{args.model}[/cyan]...")
    try:
        result = service.analyze_file(args.file, custom_prompt=args.prompt, model=args.model)
        if HAS_RICH:
            console.print("\n")
            console.print(Markdown(result))
        else:
            print("\n" + result)
    except Exception as e:
        print_error(str(e))


def cmd_review(args: argparse.Namespace, service: GeminiService) -> None:
    """Perform a structured code review."""
    print_info(f"Running structured review for [bold]{args.file}[/bold]...")
    try:
        review: CodeReviewResult = service.structured_review(args.file, model=args.model)

        if HAS_RICH:
            score_color = "green" if review.score >= 7 else "yellow" if review.score >= 5 else "red"
            console.print("\n")
            console.print(Panel(
                f"[bold]Quality Score:[/bold] [{score_color}]{review.score}/10[/{score_color}]\n\n"
                f"[bold]Summary:[/bold]\n{review.summary}",
                title=f"📋 Code Review: {args.file}",
                border_style="cyan"
            ))

            if review.strengths:
                console.print("\n[bold green]✔ Strengths:[/bold green]")
                for item in review.strengths:
                    console.print(f"  • {item}")

            if review.issues:
                console.print("\n[bold red]⚠ Potential Issues & Bugs:[/bold red]")
                for item in review.issues:
                    console.print(f"  • {item}")

            if review.suggestions:
                console.print("\n[bold blue]💡 Recommendations & Improvements:[/bold blue]")
                for item in review.suggestions:
                    console.print(f"  • {item}")
        else:
            print(f"\n--- Code Review: {args.file} ---")
            print(f"Score: {review.score}/10")
            print(f"Summary: {review.summary}\n")
            print("Strengths:")
            for s in review.strengths:
                print(f" - {s}")
            print("\nIssues:")
            for i in review.issues:
                print(f" - {i}")
            print("\nSuggestions:")
            for s in review.suggestions:
                print(f" - {s}")

    except Exception as e:
        print_error(str(e))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Gemini Assistant - Multi-turn Chat, Multimodal Analysis & Structured Code Review"
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Gemini model identifier (default: {DEFAULT_MODEL})",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: chat
    subparsers.add_parser("chat", help="Start an interactive multi-turn streaming chat")

    # Subcommand: ask
    ask_parser = subparsers.add_parser("ask", help="Send a one-shot query to Gemini")
    ask_parser.add_argument("query", nargs="+", help="Question or prompt text")

    # Subcommand: analyze
    analyze_parser = subparsers.add_parser("analyze", help="Analyze code, text, or image file")
    analyze_parser.add_argument("file", help="Path to file or image to inspect")
    analyze_parser.add_argument("--prompt", help="Custom prompt or instructions")

    # Subcommand: review
    review_parser = subparsers.add_parser("review", help="Perform structured code review and quality audit")
    review_parser.add_argument("file", help="Path to code file to review")

    args = parser.parse_args()

    try:
        service = GeminiService()
    except ValueError as e:
        print_error(str(e))
        print_info("Create a .env file with your GEMINI_API_KEY or export it in your shell.")
        sys.exit(1)

    if args.command == "chat":
        cmd_chat(args, service)
    elif args.command == "ask":
        cmd_ask(args, service)
    elif args.command == "analyze":
        cmd_analyze(args, service)
    elif args.command == "review":
        cmd_review(args, service)


if __name__ == "__main__":
    main()
