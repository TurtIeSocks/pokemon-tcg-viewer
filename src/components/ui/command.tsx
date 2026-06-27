import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import type * as React from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function Command({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive>) {
	return (
		<CommandPrimitive
			data-slot="command"
			className={cn(
				"flex h-full w-full flex-col overflow-hidden rounded-[var(--r-panel)] bg-transparent text-[var(--ink)]",
				className,
			)}
			{...props}
		/>
	);
}

function CommandDialog({
	title = "Command Palette",
	description = "Search cards, recent queries, and pages",
	children,
	className,
	open,
	onOpenChange,
	...commandProps
}: React.ComponentProps<typeof CommandPrimitive> & {
	title?: string;
	description?: string;
	className?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				// Sit in the upper third (palette convention) instead of dead-center.
				className={cn(
					"top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl",
					className,
				)}
			>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<DialogDescription className="sr-only">{description}</DialogDescription>
				<Command {...commandProps}>{children}</Command>
			</DialogContent>
		</Dialog>
	);
}

function CommandInput({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
	return (
		<div
			data-slot="command-input-wrapper"
			className="flex h-12 items-center gap-2.5 border-b border-[var(--border)] px-4"
		>
			<SearchIcon className="size-4 shrink-0 text-[var(--faint)]" />
			<CommandPrimitive.Input
				data-slot="command-input"
				className={cn(
					"flex h-11 w-full bg-transparent py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--faint)] disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function CommandList({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
	return (
		<CommandPrimitive.List
			data-slot="command-list"
			className={cn(
				"max-h-[min(420px,60vh)] scroll-py-1 overflow-x-hidden overflow-y-auto p-1.5",
				className,
			)}
			{...props}
		/>
	);
}

function CommandEmpty(
	props: React.ComponentProps<typeof CommandPrimitive.Empty>,
) {
	return (
		<CommandPrimitive.Empty
			data-slot="command-empty"
			className="py-8 text-center text-sm text-[var(--ink-muted)]"
			{...props}
		/>
	);
}

function CommandGroup({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
	return (
		<CommandPrimitive.Group
			data-slot="command-group"
			className={cn(
				"overflow-hidden p-1 text-[var(--ink)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.18em] [&_[cmdk-group-heading]]:text-[var(--faint)]",
				className,
			)}
			{...props}
		/>
	);
}

function CommandSeparator({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
	return (
		<CommandPrimitive.Separator
			data-slot="command-separator"
			className={cn("-mx-1 my-1 h-px bg-[var(--border)]", className)}
			{...props}
		/>
	);
}

function CommandItem({
	className,
	...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
	return (
		<CommandPrimitive.Item
			data-slot="command-item"
			className={cn(
				"relative flex cursor-pointer items-center gap-2.5 rounded-[var(--r-control)] px-2.5 py-2.5 text-sm text-[var(--ink)] outline-none select-none transition-colors data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-[var(--primary-wash)] data-[selected=true]:text-[var(--ink)] [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-[var(--ink-muted)] data-[selected=true]:[&_svg]:text-[var(--primary)]",
				className,
			)}
			{...props}
		/>
	);
}

function CommandShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="command-shortcut"
			className={cn(
				"ml-auto font-mono text-[11px] tracking-widest text-[var(--faint)]",
				className,
			)}
			{...props}
		/>
	);
}

export {
	Command,
	CommandDialog,
	CommandInput,
	CommandList,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandSeparator,
	CommandShortcut,
};
