#!/usr/bin/env node
'use strict'

const bufferSize = 1024;

const Speaker = require('speaker');
const readline = require('readline');

const buffer = new Buffer(bufferSize * 2);
const speaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: 44100,
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
});

rl.prompt();
rl.on('line', (line) => {
    console.log(line.split(/\s+/));
    for (let i = 0; i < buffer.length; i += 2) {
        buffer.writeInt16LE(Math.round(Math.sin(i / 10.0) * 32767.499999), i);
    }
    speaker.write(buffer);
    rl.prompt();
}).on('close', () => {
    process.exit(0);
});