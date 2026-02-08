import React, { useState, useCallback } from 'react';
import type { CellContext } from '@tanstack/react-table';
import type { TableRowData, QuickActionConfig } from '../../types';

/**
 * Cell component that renders quick action buttons.
 * Each button executes a predefined set of frontmatter updates.
 */
export function QuickActionsCell({
	row,
	table,
}: CellContext<TableRowData, unknown>) {
	const [executingId, setExecutingId] = useState<string | null>(null);
	const [successId, setSuccessId] = useState<string | null>(null);

	const quickActions = table.options.meta?.quickActions as
		| QuickActionConfig[]
		| undefined;
	const executeQuickAction = table.options.meta?.executeQuickAction as
		| ((rowIndex: number, action: QuickActionConfig) => Promise<void>)
		| undefined;

	const handleClick = useCallback(
		async (action: QuickActionConfig) => {
			if (!executeQuickAction || executingId) return;

			setExecutingId(action.id);
			try {
				await executeQuickAction(row.index, action);
				// Show success state briefly
				setSuccessId(action.id);
				setTimeout(() => setSuccessId(null), 800);
			} catch (err) {
				console.error('[Bases Power User] Quick action failed:', err);
			} finally {
				setExecutingId(null);
			}
		},
		[executeQuickAction, executingId, row.index]
	);

	if (!quickActions || quickActions.length === 0) {
		return null;
	}

	return (
		<div className="quick-actions-cell">
			{quickActions.map((action) => {
				const isExecuting = executingId === action.id;
				const isSuccess = successId === action.id;

				let className = 'quick-action-btn';
				if (isExecuting) className += ' executing';
				if (isSuccess) className += ' success';

				return (
					<button
						key={action.id}
						className={className}
						onClick={(e) => {
							e.stopPropagation();
							handleClick(action);
						}}
						disabled={!!executingId}
						title={action.updates
							.map((u) => `${u.property}=${u.value}`)
							.join(', ')}
					>
						{isExecuting ? '...' : isSuccess ? '\u2713' : action.label}
					</button>
				);
			})}
		</div>
	);
}
