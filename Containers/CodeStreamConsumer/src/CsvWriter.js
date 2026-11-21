const fs = require('fs/promises');
const path = require('path');

const directory = '/results';
const csvPath = path.join(directory, `timings-${Date.now()}.csv`);

const columns = [
    'file_number',
    'file_name',
    'line_count',
    'clone_count',
    'processing_time_ms',
    'matching_and_clone_storage_time_ms',
    'processing_started_at',
    'heap_used_mib',
    'heap_allocated_mib'
];

let initialized = false;
let pending = Promise.resolve();

// Handle commas, quotes and newlines inside CSV values.
function escapeCsv(value) {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text)
        ? '"' + text.replace(/"/g, '""') + '"'
        : text;
}

function appendTiming(entry) {
    const values = [
        entry.number,
        entry.name,
        entry.lines,
        entry.clones,
        entry.totalMs,
        entry.matchMs,
        entry.processingStartedAt,
        entry.heapUsedMiB,
        entry.heapAllocatedMiB
    ];

    const row = values.map(escapeCsv).join(',') + '\n';

    pending = pending.then(async () => {
        if (!initialized) {
            await fs.mkdir(directory, { recursive: true });

            await fs.writeFile(csvPath, columns.join(',') + '\n', {
                encoding: 'utf8',
                flag: 'wx' // Create a new file; never overwrite an existing one.
            });

            initialized = true;
            console.log('Writing timing results to:', csvPath);
        }

        await fs.appendFile(csvPath, row, 'utf8');
    });

    return pending;
}

module.exports = { appendTiming };