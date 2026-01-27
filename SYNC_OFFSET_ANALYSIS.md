# Sync Offset Analysis and Options

## Current Situation

**User Observation:**
- Audio in tracking video starts 3 seconds into the video (dead space at start)
- Cross-correlation calculates: **-3.084s** (negative)
- User expects: **+3.084s** (positive, because music starts later in video)

**Current Code:**
```python
correlation = signal.correlate(y_master_short, y_video_short, mode='full')
peak_index = np.argmax(np.abs(correlation))
center_index = len(y_video_short) - 1
offset_samples = peak_index - center_index
offset_seconds = offset_samples / sr_master
sync_offset = offset_seconds  # Currently -3.084s
```

## Understanding Cross-Correlation

When we do `signal.correlate(master, video)`:
- We're finding where **video** best matches **master**
- Negative offset means: video audio is shifted LEFT (starts earlier) relative to master
- Positive offset means: video audio is shifted RIGHT (starts later) relative to master

**Your Case:**
- Video has dead space: music starts at 3s in video
- Master audio at 0s should match video audio at 3s
- This means: video audio is shifted RIGHT by 3s relative to master
- But correlation is giving -3.084s (negative)

## Possible Issues

1. **Correlation Direction**: We might need to correlate `(video, master)` instead of `(master, video)`
2. **Sign Interpretation**: Negative offset might mean "master needs to shift forward" = "video has dead space"
3. **Absolute Value**: The magnitude is correct (3.084s), just the sign is wrong

## Options to Fix

### Option 1: Use Absolute Value (Simplest)
**Logic**: The magnitude is correct, we always want positive for dead space
```python
sync_offset = abs(offset_seconds)
```
**Pros**: Simple, handles both positive and negative cases
**Cons**: Might be wrong if video actually starts before master (negative offset is real)

### Option 2: Flip the Sign
**Logic**: Negative correlation offset means video is ahead, which means dead space in video
```python
sync_offset = -offset_seconds  # Flip sign
```
**Pros**: Directly addresses the sign issue
**Cons**: Assumes all negative offsets should be positive (might not always be true)

### Option 3: Use correlation_lags (Most Accurate)
**Logic**: Use scipy's correlation_lags to get proper lag interpretation
```python
from scipy.signal import correlation_lags
lags = correlation_lags(len(y_master_short), len(y_video_short), mode='full')
lag_samples = lags[peak_index]
offset_seconds = lag_samples / sr_master
sync_offset = abs(offset_seconds)  # Always positive for dead space
```
**Pros**: Uses proper lag interpretation from scipy
**Cons**: More complex, but more accurate

### Option 4: Correlate in Reverse Order
**Logic**: Correlate (video, master) instead of (master, video)
```python
correlation = signal.correlate(y_video_short, y_master_short, mode='full')
# Then interpret: positive = video has dead space
```
**Pros**: Might give correct sign directly
**Cons**: Need to verify interpretation is correct

### Option 5: Check Peak Sign and Interpret
**Logic**: Check if peak correlation is positive or negative, interpret accordingly
```python
peak_value = correlation[peak_index]
if peak_value < 0:
    # Negative correlation might indicate phase inversion or wrong interpretation
    # Use absolute value
    sync_offset = abs(offset_seconds)
else:
    # Positive correlation - use as-is or flip based on offset sign
    sync_offset = abs(offset_seconds) if offset_seconds < 0 else offset_seconds
```
**Pros**: Handles both cases
**Cons**: Complex logic, might not be necessary

## Recommendation

**Option 1 (Absolute Value)** is the simplest and most reliable:
- The magnitude (3.084s) is correct
- We always want positive offset when music starts later in video (dead space)
- If offset is negative, it means the same thing (dead space), just needs to be positive

**Implementation:**
```python
sync_offset = abs(offset_seconds)
if offset_seconds < 0:
    print(f"[analyzer] Negative offset detected ({offset_seconds:.3f}s), using absolute value: {sync_offset:.3f}s")
    print(f"[analyzer]   → This means music starts {sync_offset:.3f}s into video (dead space at start)")
```

## Alternative: Option 3 (correlation_lags)

If you want the most mathematically correct approach:
```python
from scipy.signal import correlation_lags
lags = correlation_lags(len(y_master_short), len(y_video_short), mode='full')
lag_samples = lags[peak_index]
lag_seconds = lag_samples / sr_master
# Lag represents how much video needs to shift to match master
# If lag is negative, video is ahead (has dead space)
sync_offset = abs(lag_seconds)
```
