import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { App, TFile } from 'obsidian';
import {
	ExternalLink,
	PanelRight,
	AppWindow,
	Pencil,
	Copy,
	FolderOpen,
	FileSearch,
	Trash2,
} from 'lucide-react';

interface FileContextMenuProps {
	x: number;
	y: number;
	file: TFile;
	app: App;
	onClose: () => void;
}

const ICON_SIZE = 14;

export function FileContextMenu({
	x,
	y,
	file,
	app,
	onClose,
}: FileContextMenuProps) {
	const menuRef = useRef<HTMLDivElement>(null);

	// Close on click outside or escape
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};

		document.addEventListener('mousedown', handleClickOutside);
		document.addEventListener('keydown', handleEscape);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('keydown', handleEscape);
		};
	}, [onClose]);

	// Adjust position to stay within viewport
	useEffect(() => {
		if (menuRef.current) {
			const rect = menuRef.current.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			let newX = x;
			let newY = y;

			if (x + rect.width > viewportWidth) {
				newX = Math.max(0, x - rect.width);
			}
			if (y + rect.height > viewportHeight) {
				newY = Math.max(0, y - rect.height);
			}

			menuRef.current.style.left = `${newX}px`;
			menuRef.current.style.top = `${newY}px`;
		}
	}, [x, y]);

	const handleOpenInNewTab = () => {
		const leaf = app.workspace.getLeaf('tab');
		leaf.openFile(file);
		onClose();
	};

	const handleOpenToRight = () => {
		const leaf = app.workspace.getLeaf('split');
		leaf.openFile(file);
		onClose();
	};

	const handleOpenInNewWindow = () => {
		const leaf = app.workspace.getLeaf('window');
		leaf.openFile(file);
		onClose();
	};

	const handleRename = () => {
		// Use Obsidian's file rename prompt
		(app as any).fileManager.promptForFileRename?.(file);
		onClose();
	};

	const handleCopyPath = () => {
		navigator.clipboard.writeText(file.path);
		onClose();
	};

	const handleOpenInDefaultApp = () => {
		(app as any).openWithDefaultApp?.(file.path);
		onClose();
	};

	const handleShowInSystemExplorer = () => {
		(app as any).showInFolder?.(file.path);
		onClose();
	};

	const handleDelete = async () => {
		// Use trash (moves to .trash folder or system trash)
		await app.vault.trash(file, true);
		onClose();
	};

	return createPortal(
		<div
			ref={menuRef}
			className="file-context-menu"
			style={{ left: x, top: y }}
		>
			<div className="file-menu-item" onClick={handleOpenInNewTab}>
				<ExternalLink size={ICON_SIZE} />
				<span>Open in new tab</span>
			</div>
			<div className="file-menu-item" onClick={handleOpenToRight}>
				<PanelRight size={ICON_SIZE} />
				<span>Open to the right</span>
			</div>
			<div className="file-menu-item" onClick={handleOpenInNewWindow}>
				<AppWindow size={ICON_SIZE} />
				<span>Open in new window</span>
			</div>

			<div className="file-menu-separator" />

			<div className="file-menu-item" onClick={handleRename}>
				<Pencil size={ICON_SIZE} />
				<span>Rename...</span>
			</div>

			<div className="file-menu-separator" />

			<div className="file-menu-item" onClick={handleCopyPath}>
				<Copy size={ICON_SIZE} />
				<span>Copy path</span>
			</div>

			<div className="file-menu-separator" />

			<div className="file-menu-item" onClick={handleOpenInDefaultApp}>
				<FileSearch size={ICON_SIZE} />
				<span>Open in default app</span>
			</div>
			<div className="file-menu-item" onClick={handleShowInSystemExplorer}>
				<FolderOpen size={ICON_SIZE} />
				<span>Show in system explorer</span>
			</div>

			<div className="file-menu-separator" />

			<div className="file-menu-item file-menu-danger" onClick={handleDelete}>
				<Trash2 size={ICON_SIZE} />
				<span>Delete file</span>
			</div>
		</div>,
		document.body
	);
}
