import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface DateEditorProps {
	value: string | null;
	type: 'date' | 'datetime';
	onSave: (value: string | null) => void;
	onCancel: () => void;
	openCalendar?: boolean;
}

const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
];

function parseDate(value: string | null): { year: number; month: number; day: number; time: string } {
	const now = new Date();
	if (!value) return { year: now.getFullYear(), month: now.getMonth(), day: 0, time: '00:00' };
	const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	const timeMatch = value.match(/T(\d{2}:\d{2})/);
	if (dateMatch) {
		return {
			year: parseInt(dateMatch[1]),
			month: parseInt(dateMatch[2]) - 1,
			day: parseInt(dateMatch[3]),
			time: timeMatch ? timeMatch[1] : '00:00',
		};
	}
	return { year: now.getFullYear(), month: now.getMonth(), day: 0, time: '00:00' };
}

function parseTextInput(text: string): string | null {
	const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!m) return null;
	const month = parseInt(m[1]);
	const day = parseInt(m[2]);
	const year = parseInt(m[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) return null;
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatForInput(value: string | null): string {
	if (!value) return '';
	const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (m) return `${m[2]}/${m[3]}/${m[1]}`;
	return '';
}

function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
	return new Date(year, month, 1).getDay();
}

export function DateEditor({ value, type, onSave, onCancel, openCalendar }: DateEditorProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const savedRef = useRef(false);
	const parsed = parseDate(value);

	const [textValue, setTextValue] = useState(() => formatForInput(value));
	const [showCalendar, setShowCalendar] = useState(openCalendar ?? false);
	const [viewYear, setViewYear] = useState(parsed.year);
	const [viewMonth, setViewMonth] = useState(parsed.month);
	const [selectedDay, setSelectedDay] = useState(parsed.day);
	const [selectedYear, setSelectedYear] = useState(parsed.year);
	const [selectedMonth, setSelectedMonth] = useState(parsed.month);
	const [timeValue, setTimeValue] = useState(parsed.time);

	const today = new Date();
	const todayYear = today.getFullYear();
	const todayMonth = today.getMonth();
	const todayDay = today.getDate();

	useEffect(() => {
		inputRef.current?.focus();
		inputRef.current?.select();
	}, []);

	const buildValue = useCallback((y: number, m: number, d: number, t: string): string => {
		const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		if (type === 'datetime') return `${dateStr}T${t}`;
		return dateStr;
	}, [type]);

	const doSave = useCallback((val: string | null) => {
		savedRef.current = true;
		onSave(val);
	}, [onSave]);

	const handleTextKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (!textValue) { doSave(null); return; }
			const p = parseTextInput(textValue);
			if (p) doSave(type === 'datetime' ? `${p}T${timeValue}` : p);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	};

	const handleTextBlur = (e: React.FocusEvent) => {
		if (containerRef.current?.contains(e.relatedTarget as Node)) return;
		if (savedRef.current) return;
		if (!textValue) { doSave(null); return; }
		const p = parseTextInput(textValue);
		if (p) doSave(type === 'datetime' ? `${p}T${timeValue}` : p);
		else onCancel();
	};

	const handleDayClick = useCallback((day: number) => {
		setSelectedDay(day);
		setSelectedYear(viewYear);
		setSelectedMonth(viewMonth);
		doSave(buildValue(viewYear, viewMonth, day, timeValue));
	}, [viewYear, viewMonth, timeValue, buildValue, doSave]);

	const handlePrevMonth = useCallback(() => {
		setViewMonth(prev => {
			if (prev === 0) { setViewYear(y => y - 1); return 11; }
			return prev - 1;
		});
	}, []);

	const handleNextMonth = useCallback(() => {
		setViewMonth(prev => {
			if (prev === 11) { setViewYear(y => y + 1); return 0; }
			return prev + 1;
		});
	}, []);

	const handleToday = useCallback(() => {
		doSave(buildValue(todayYear, todayMonth, todayDay, timeValue));
	}, [todayYear, todayMonth, todayDay, timeValue, buildValue, doSave]);

	const handleClear = useCallback(() => {
		doSave(null);
	}, [doSave]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (savedRef.current) return;
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				if (!textValue) { doSave(null); return; }
				const p = parseTextInput(textValue);
				if (p) doSave(type === 'datetime' ? `${p}T${timeValue}` : p);
				else onCancel();
			}
		};
		const timer = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside);
		}, 0);
		return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClickOutside); };
	}, [textValue, timeValue, type, doSave, onCancel]);

	// Calendar grid
	const daysInMonth = getDaysInMonth(viewYear, viewMonth);
	const firstDay = getFirstDayOfWeek(viewYear, viewMonth);
	const cells: (number | null)[] = [];
	for (let i = 0; i < firstDay; i++) cells.push(null);
	for (let d = 1; d <= daysInMonth; d++) cells.push(d);
	while (cells.length % 7 !== 0) cells.push(null);

	const isSelected = (day: number) =>
		day === selectedDay && viewYear === selectedYear && viewMonth === selectedMonth;
	const isToday = (day: number) =>
		day === todayDay && viewYear === todayYear && viewMonth === todayMonth;

	return (
		<div className="date-editor-container" ref={containerRef}>
			<span className="cell-date">
				<CalendarIcon
					size={14}
					className="cell-date-icon cell-date-icon-clickable"
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => setShowCalendar(prev => !prev)}
				/>
				<input
					ref={inputRef}
					className="date-editor-inline"
					value={textValue}
					placeholder="mm/dd/yyyy"
					onChange={(e) => setTextValue(e.target.value)}
					onKeyDown={handleTextKeyDown}
					onBlur={handleTextBlur}
				/>
			</span>
			{showCalendar && (
				<div className="calendar-popup calendar-popup-dropdown">
					<div className="calendar-header">
						<button className="calendar-nav" onClick={handlePrevMonth} type="button">
							<ChevronLeft size={16} />
						</button>
						<span className="calendar-month-label">
							{MONTH_NAMES[viewMonth]} {viewYear}
						</span>
						<button className="calendar-nav" onClick={handleNextMonth} type="button">
							<ChevronRight size={16} />
						</button>
					</div>
					<div className="calendar-grid">
						{DAYS_OF_WEEK.map(d => (
							<div key={d} className="calendar-day-header">{d}</div>
						))}
						{cells.map((day, i) => (
							<div
								key={i}
								className={
									'calendar-day' +
									(day === null ? ' empty' : '') +
									(day !== null && isToday(day) ? ' today' : '') +
									(day !== null && isSelected(day) ? ' selected' : '')
								}
								onClick={day !== null ? () => handleDayClick(day) : undefined}
							>
								{day}
							</div>
						))}
					</div>
					{type === 'datetime' && (
						<div className="calendar-time">
							<input
								type="time"
								className="calendar-time-input"
								value={timeValue}
								onChange={(e) => setTimeValue(e.target.value)}
							/>
						</div>
					)}
					<div className="calendar-footer">
						<button className="calendar-footer-btn" onClick={handleClear} type="button">Clear</button>
						<button className="calendar-footer-btn" onClick={handleToday} type="button">Today</button>
					</div>
				</div>
			)}
		</div>
	);
}
