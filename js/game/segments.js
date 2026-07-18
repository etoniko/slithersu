/** Сегменты игрока: id1 (мин.) — голова/камера, id2 следует за id1, id3 за id2, … */

export function sortSegmentIds(ids) {
    return ids.slice().sort((a, b) => a - b);
}

/** Главный сегмент — наименьший node id. */
export function getMainSegmentId(segmentIds) {
    if (!segmentIds.length) return null;
    return sortSegmentIds(segmentIds)[0];
}

/** Индекс сегмента в цепочке: 0 = голова, 1 = второй, … */
export function getSegmentIndex(segmentIds, cellId) {
    const sorted = sortSegmentIds(segmentIds);
    const idx = sorted.indexOf(cellId);
    return idx >= 0 ? idx : sorted.length;
}

/** z-index: голова (меньший id) поверх хвоста; не зависит от массы. */
export function segmentZIndex(segmentIndex, segmentCount, cellNodeId) {
    const base = 10000;
    if (segmentCount > 0 && segmentIndex >= 0) {
        return base + (segmentCount - segmentIndex) * 4;
    }
    return base + (cellNodeId % 1000000);
}
