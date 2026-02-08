import React, { useCallback, useState } from 'react';
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
 * Right-click shows file context menu.
 */
export function FileNameCell({
	row,
}: CellContext<TableRowData, unknown>) {
	const app = useApp();
	const file = row.original.file;
	const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

	const handleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			app.workspace.openLinkText(file.path, '');
		},
		[app, file]
	);

	const handleContextMenu = useCallback((e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setContextMenu({ x: e.clientX, y: e.clientY });
	}, []);

	return (
		<>
			<span
				className="cell-file-name"
				onClick={handleClick}
				onContextMenu={handleContextMenu}
				title={file.path}
			>
				{file.basename}
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
