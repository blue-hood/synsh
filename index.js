#!/usr/bin/env node
'use strict'

const bufferSize = 1024;
const sampleRate = 44100;

const Speaker = require('speaker');
const readline = require('readline');
const synth = require('./synth');

const buffer = new Buffer(bufferSize * 2);
const speaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: sampleRate,
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
});

synth.setOnCompleteHandler(() => {
    for (let i = 0; i < buffer.length; i += 2) {
        buffer.writeInt16LE(Math.round(Math.sin(2.0 * Math.PI * 440.0 * i / sampleRate) * 32767), i);
    }
    speaker.write(buffer);
    rl.prompt();
});

rl.prompt();
rl.on('line', (line) => {
    let args = line.replace(/#.*/, '').trim().split(/\s+/);
    if (args[0] === '') args = [];

    synth.pushOnSuccessHandler((response) => {
        const printResponse = (response, level) => {
            for (const key in response) {
                const value = response[key];
                let line = '';

                for (let i = 0; i < level; i++) line += ' ';
                line += `${key}: `;

                if (value instanceof Object) {
                    console.log(line);
                    printResponse(value, level + 2);
                } else {
                    line += value;
                    console.log(line);
                }

            }
        };

        printResponse(response, 0);
    });
    synth.write(args);
}).on('close', () => {
    process.exit(0);
});