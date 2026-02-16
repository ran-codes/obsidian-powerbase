import React, { useCallback } from 'react';
import type { CellContext } from '@tanstack/react-table';
import type { TableRowData } from '../../types';
import { useApp } from '../AppContext';

/**
 * Read-only cell renderer for rollup (aggregated) values.
 * Displays numbers, percentages, and link chips for list/unique rollups.
 */
export function RollupCell({ getValue, row }: CellContext<TableRowData, unknown>) {
	const value = getValue();
	const app = useApp();
	const sourcePath = row.original.file.path;

	const handleLinkClick = useCallback(
		(e: React.MouseEvent, path: string) => {
			e.stopPropagation();
			app.workspace.openLinkText(path, sourcePath);
		},
		[app, sourcePath]
	);

	if (value === null || value === undefined) {
		return <span className="cell-empty" />;
	}

	// Numeric values
	if (typeof value === 'number') {
		return (
			<span className="rollup-cell rollup-numeric">
				{Number.isInteger(value) ? value : value.toFixed(2)}
			</span>
		);
	}

	// Percentage strings "(3/5) 60%"
	if (typeof value === 'string' && value.includes('%')) {
		return <span className="rollup-cell rollup-percent">{value}</span>;
	}

	// Array of link objects / strings from list/unique aggregation
	if (Array.isArray(value)) {
		return (
			<div className="rollup-cell rollup-links">
				{value.map((item, i) => {
					if (typeof item === 'object' && item.path) {
						return (
							<span
								key={i}
								className="relation-chip"
								title={item.path}
							>
								<span
									className="relation-chip-label"
									onClick={(e) => handleLinkClick(e, item.path)}
								>
									{item.display}
								</span>
							</span>
						);
					}
					return (
						<span key={i} className="rollup-text-item">
							{String(item)}
						</span>
					);
				})}
			</div>
		);
	}

	// Fallback: plain string
	return (
		<span className="rollup-cell rollup-list" title={String(value)}>
			{String(value)}
		</span>
	);
}
