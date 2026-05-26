import React, { useState } from 'react';
import { Button, CircularProgress, IconButton } from '@mui/material';
import { StaticDatePicker } from '@mui/x-date-pickers/StaticDatePicker';
import { PickersDay, PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import dayjs, { Dayjs } from 'dayjs';

interface Checkpoint2to3Props {
    onSubmit: (meetingDate: string) => Promise<void>;
    onClose: () => void;
}

const Checkpoint2to3: React.FC<Checkpoint2to3Props> = ({ onSubmit, onClose }) => {
    const [selectedDate, setSelectedDate] = useState<Dayjs | null>(dayjs().add(1, 'day'));
    const [hour, setHour] = useState<number>(9);
    const [minute, setMinute] = useState<number>(0);
    const [ampm, setAmpm] = useState<'AM' | 'PM'>('AM');
    const [submitting, setSubmitting] = useState(false);

    // Text inputs state to allow user typing choices
    const [hourInput, setHourInput] = useState<string>('09');
    const [minuteInput, setMinuteInput] = useState<string>('00');

    // Focus state to render active borders
    const [hourFocused, setHourFocused] = useState(false);
    const [minuteFocused, setMinuteFocused] = useState(false);

    const handleHourUp = () => {
        let nextHour = hour;
        if (hour === 11) {
            nextHour = 12;
            setAmpm(prev => (prev === 'AM' ? 'PM' : 'AM'));
        } else if (hour === 12) {
            nextHour = 1;
        } else {
            nextHour = hour + 1;
        }
        setHour(nextHour);
        setHourInput(nextHour.toString().padStart(2, '0'));
    };

    const handleHourDown = () => {
        let nextHour = hour;
        if (hour === 12) {
            nextHour = 11;
            setAmpm(prev => (prev === 'AM' ? 'PM' : 'AM'));
        } else if (hour === 1) {
            nextHour = 12;
        } else {
            nextHour = hour - 1;
        }
        setHour(nextHour);
        setHourInput(nextHour.toString().padStart(2, '0'));
    };

    const handleMinuteUp = () => {
        const nextMin = (minute + 5) % 60;
        setMinute(nextMin);
        setMinuteInput(nextMin.toString().padStart(2, '0'));
    };

    const handleMinuteDown = () => {
        const nextMin = (minute - 5 + 60) % 60;
        setMinute(nextMin);
        setMinuteInput(nextMin.toString().padStart(2, '0'));
    };

    const toggleAmPm = () => {
        setAmpm(prev => (prev === 'AM' ? 'PM' : 'AM'));
    };

    // User typing handlers
    const handleHourInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const cleaned = val.replace(/\D/g, ''); // numbers only
        setHourInput(cleaned);
        if (cleaned !== '') {
            const num = parseInt(cleaned, 10);
            if (num >= 1 && num <= 12) {
                setHour(num);
            }
        }
    };

    const handleHourInputBlur = () => {
        setHourFocused(false);
        let num = parseInt(hourInput, 10);
        if (isNaN(num) || num < 1 || num > 12) {
            num = 9; // reset fallback
        }
        setHour(num);
        setHourInput(num.toString().padStart(2, '0'));
    };

    const handleMinuteInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const cleaned = val.replace(/\D/g, ''); // numbers only
        setMinuteInput(cleaned);
        if (cleaned !== '') {
            const num = parseInt(cleaned, 10);
            if (num >= 0 && num <= 59) {
                setMinute(num);
            }
        }
    };

    const handleMinuteInputBlur = () => {
        setMinuteFocused(false);
        let num = parseInt(minuteInput, 10);
        if (isNaN(num) || num < 0 || num > 59) {
            num = 0; // reset fallback
        }
        setMinute(num);
        setMinuteInput(num.toString().padStart(2, '0'));
    };

    const handleConfirm = async () => {
        if (!selectedDate) {
            alert('Please select a valid date.');
            return;
        }
        setSubmitting(true);
        try {
            let hours24 = hour;
            if (ampm === 'PM' && hour !== 12) {
                hours24 += 12;
            } else if (ampm === 'AM' && hour === 12) {
                hours24 = 0;
            }
            
            const finalDateTime = selectedDate.hour(hours24).minute(minute).second(0);
            const formattedDate = finalDateTime.format('YYYY-MM-DDTHH:mm');
            await onSubmit(formattedDate);
        } catch (error) {
            console.error('Failed to schedule meeting:', error);
        } finally {
            setSubmitting(false);
        }
    };

    const inputBaseStyle: React.CSSProperties = {
        border: 'none',
        background: 'transparent',
        fontSize: '2.5rem',
        fontWeight: 700,
        color: '#111827',
        width: '56px',
        textAlign: 'center',
        fontFamily: 'monospace',
        outline: 'none',
        padding: '2px 0',
        margin: '0',
        transition: 'border-color 0.2s ease',
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <span style={{ fontSize: '13px', color: '#4b5563', lineHeight: '1.5' }}>
                Please set the date and time for the official <strong>SK Session</strong>. This will notify all officials to review the current proposals and budget allocations.
            </span>

            <div style={{ 
                border: '1px solid #e5e7eb', 
                borderRadius: '12px', 
                overflow: 'hidden',
                backgroundColor: '#ffffff',
                height: '380px',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'stretch'
            }}>
                {/* Left Column: Stable Static Date Picker */}
                <div style={{ flex: 1.2, borderRight: '1px solid #f3f4f6', overflow: 'hidden' }}>
                    <StaticDatePicker
                        displayStaticWrapperAs="desktop"
                        value={selectedDate}
                        onChange={(newValue) => setSelectedDate(newValue)}
                        minDate={dayjs().add(1, 'day')}
                        slotProps={{
                            actionBar: { actions: [] }
                        }}
                        slots={{
                            day: (props: PickersDayProps<Dayjs>) => {
                                const { day, outsideCurrentMonth, ...other } = props;
                                const isReviewWindow = day.isSame(dayjs(), 'day');
                                const isPast = day.isBefore(dayjs(), 'day');

                                if (isReviewWindow && !outsideCurrentMonth) {
                                    return (
                                        <PickersDay
                                            {...other}
                                            day={day}
                                            outsideCurrentMonth={outsideCurrentMonth}
                                            disabled
                                            sx={{
                                                backgroundColor: '#e5e7eb !important',
                                                color: '#6b7280 !important',
                                                borderRadius: '50%',
                                                '&:hover': {
                                                    backgroundColor: '#e5e7eb !important',
                                                }
                                            }}
                                        />
                                    );
                                }
                                return <PickersDay {...other} day={day} outsideCurrentMonth={outsideCurrentMonth} disabled={isPast || isReviewWindow} />;
                            }
                        }}
                        sx={{
                            backgroundColor: '#ffffff',
                            height: '100%',
                            '& .MuiPickersLayout-root': {
                                height: '100%',
                                backgroundColor: '#ffffff',
                            },
                            '& .MuiPickersLayout-contentWrapper': {
                                backgroundColor: '#ffffff',
                                height: '100%',
                            }
                        }}
                    />
                </div>

                {/* Right Column: Premium Digital Time Picker */}
                <div style={{ 
                    flex: 1, 
                    display: 'flex', 
                    flexDirection: 'column', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    backgroundColor: '#ffffff',
                    padding: '20px'
                }}>
                    <span style={{ 
                        fontSize: '13px', 
                        fontWeight: 600, 
                        color: '#4b5563', 
                        textTransform: 'uppercase', 
                        marginBottom: '20px', 
                        letterSpacing: '0.05em' 
                    }}>
                        Select Time
                    </span>
                    
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        backgroundColor: '#f9fafb',
                        borderRadius: '16px',
                        padding: '24px 16px',
                        border: '1px solid #e5e7eb',
                        boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.02)'
                    }}>
                        {/* Hour Block */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <IconButton onClick={handleHourUp} size="small" style={{ color: '#4f46e5' }}>
                                <KeyboardArrowUpIcon sx={{ fontSize: 28 }} />
                            </IconButton>
                            <input
                                type="text"
                                value={hourInput}
                                onChange={handleHourInputChange}
                                onBlur={handleHourInputBlur}
                                onFocus={() => setHourFocused(true)}
                                maxLength={2}
                                style={{
                                    ...inputBaseStyle,
                                    borderBottom: hourFocused ? '2px solid #4f46e5' : '2px solid transparent'
                                }}
                            />
                            <IconButton onClick={handleHourDown} size="small" style={{ color: '#4f46e5' }}>
                                <KeyboardArrowDownIcon sx={{ fontSize: 28 }} />
                            </IconButton>
                        </div>

                        <span style={{ fontSize: '2.5rem', fontWeight: 700, color: '#9ca3af', height: '60px', display: 'flex', alignItems: 'center', marginTop: '-12px' }}>
                            :
                        </span>

                        {/* Minute Block */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <IconButton onClick={handleMinuteUp} size="small" style={{ color: '#4f46e5' }}>
                                <KeyboardArrowUpIcon sx={{ fontSize: 28 }} />
                            </IconButton>
                            <input
                                type="text"
                                value={minuteInput}
                                onChange={handleMinuteInputChange}
                                onBlur={handleMinuteInputBlur}
                                onFocus={() => setMinuteFocused(true)}
                                maxLength={2}
                                style={{
                                    ...inputBaseStyle,
                                    borderBottom: minuteFocused ? '2px solid #4f46e5' : '2px solid transparent'
                                }}
                            />
                            <IconButton onClick={handleMinuteDown} size="small" style={{ color: '#4f46e5' }}>
                                <KeyboardArrowDownIcon sx={{ fontSize: 28 }} />
                            </IconButton>
                        </div>

                        {/* AM/PM Block */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginLeft: '4px' }}>
                            <IconButton onClick={toggleAmPm} size="small" style={{ color: '#4f46e5' }}>
                                <KeyboardArrowUpIcon sx={{ fontSize: 28 }} />
                            </IconButton>
                            <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#4f46e5', width: '56px', textAlign: 'center', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
                                {ampm}
                            </span>
                            <IconButton onClick={toggleAmPm} size="small" style={{ color: '#4f46e5' }}>
                                <KeyboardArrowDownIcon sx={{ fontSize: 28 }} />
                            </IconButton>
                        </div>
                    </div>

                    <span style={{ fontSize: '11px', color: '#9ca3af', marginTop: '16px', textAlign: 'center', maxWidth: '180px' }}>
                        Click arrows or click inside the numbers to type values.
                    </span>
                </div>
            </div>

            <div style={{ 
                display: 'flex', 
                justifyContent: 'flex-end', 
                gap: '12px', 
                marginTop: '10px',
                borderTop: '1px solid #f3f4f6',
                paddingTop: '16px' 
            }}>
                <Button 
                    variant="outlined" 
                    onClick={onClose}
                    disabled={submitting}
                    sx={{ 
                        textTransform: 'none',
                        borderRadius: '8px',
                        borderColor: '#d1d5db',
                        color: '#374151',
                        '&:hover': {
                            borderColor: '#9ca3af',
                            backgroundColor: '#f9fafb'
                        }
                    }}
                >
                    Cancel
                </Button>
                <Button 
                    variant="contained" 
                    onClick={handleConfirm}
                    disabled={submitting}
                    startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <CalendarMonthIcon />}
                    sx={{ 
                        textTransform: 'none',
                        borderRadius: '8px',
                        backgroundColor: '#4f46e5',
                        boxShadow: 'none',
                        '&:hover': {
                            backgroundColor: '#4338ca',
                            boxShadow: 'none'
                        }
                    }}
                >
                    {submitting ? 'Scheduling...' : 'Schedule & Proceed'}
                </Button>
            </div>
        </div>
    );
};

export default Checkpoint2to3;
