import React, { useCallback, useState, useRef } from 'react';
import { Copy, Check } from 'lucide-react';
import type { CellContext } from '@tanstack/react-table';
import type { TableRowData } from '../../types';
import { useApp } from '../AppContext';
import { FileContextMenu } from '../FileContextMenu';

interface ContextMenuState {
	x: number;
	y: number;
}

/**
 * File name cell renderer.
 * Renders the note's basename as a clickable internal link
 * that opens the note in the workspace.
 * Copy icon copies wikilink to clipboard.
 * Right-click shows file context menu.
 */
export function FileNameCell({
	row,
}: CellContext<TableRowData, unknown>) {
	const app = useApp();
	const file = row.original.file;
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			app.workspace.openLinkText(file.path, '');
		},
		[app, file]
	);

	const handleCopy = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			const pathWithoutExt = file.path.replace(/\.md$/, '');
			navigator.clipboard.writeText(`[[${pathWithoutExt}]]`);
			setCopied(true);
			if (timerRef.current) clearTimeout(timerRef.current);
			timerRef.current = setTimeout(() => setCopied(false), 1000);
		},
		[file]
	);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY });
	}, []);

	return (
		<>
			<span className="cell-file-name-wrapper" onContextMenu={handleContextMenu}>
				<span
					className="cell-file-name-copy"
					onClick={handleCopy}
					title="Copy wikilink"
				>
					{copied
						? <Check size={14} className="cell-file-name-copy-check" />
						: <Copy size={14} />}
				</span>
				<span
					className="cell-file-name"
					onClick={handleClick}
					title={file.path}
				>
					{file.basename}
				</span>
			</span>
			{contextMenu && (
				<FileContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					file={file}
					app={app}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</>
	);
}
