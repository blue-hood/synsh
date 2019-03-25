#!/usr/bin/env node
'use strict'

const sampleRate = 44100;

const Speaker = require('speaker');
const readline = require('readline');
const synth = require('./synth');

const comNameTable = {};
let isCompleted = true;
let isEof = false;
const commandBuffer = [];

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
    isCompleted = true;
    rl.prompt();

    if (!execute() && isEof) {
        process.exit(0);
    }
});

const send = (args, onSuccess) => {
    synth.pushOnSuccessHandler(onSuccess);
    synth.write(args);
    isCompleted = false;
}

const isName = (arg) => {
    return arg.match(/^[a-z_][0-9a-z_]*$/) !== null;
};

const comUuid = (arg) => {
    if (arg.match(/^[a-z_][0-9a-z_]*$/) === null) {
        return arg;
    }

    if (!(arg in comNameTable)) {
        return arg;
    }

    return comNameTable[arg].uuid;
};

const inPortUuid = (arg) => {
    if (arg.match(/^[a-z_][0-9a-z_]*\..*$/) === null) {
        return arg;
    }

    const [comName, inName] = arg.split('.');
    if (!(comName in comNameTable) || !(inName in comNameTable[comName].inputs)) {
        return arg;
    }

    return comNameTable[comName].inputs[inName];
}

const outPortUuid = (arg) => {
    if (arg.match(/^[a-z_][0-9a-z_]*\..*$/) === null) {
        return arg;
    }

    const [comName, outName] = arg.split('.');
    if (!(comName in comNameTable) || !(outName in comNameTable[comName].outputs)) {
        return arg;
    }

    return comNameTable[comName].outputs[outName];
}

const execute = () => {
    let args;
    let isExecuted = false;

    while (isCompleted && (args = commandBuffer.shift()) !== undefined) {
        isExecuted = true;
        let onSuccess = (response) => {
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
        }

        // addcom (component type) as (name)
        if (args.length == 4 && args[0] == 'addcom' && args[2] == 'as' && isName(args[3])) {
            const name = args[3];
            if (name in comNameTable) {
                console.log("定義済みの名前です。");
                args = [];
            }

            args.splice(2, 2);

            onSuccess = (response) => {
                const uuid = response.uuid;

                send(['lsport', uuid], (response) => {
                    const inputs = {};
                    response.inputs.forEach((input) => {
                        inputs[input.type] = input.uuid;
                    });

                    const outputs = {};
                    response.outputs.forEach((output) => {
                        outputs[output.type] = output.uuid;
                    });

                    comNameTable[name] = {
                        'uuid': uuid,
                        'inputs': inputs,
                        'outputs': outputs,
                    };
                });

            };
        }
        // connect (出力ポート名) (入力ポート名) ...
        else if (args.length >= 3 && args[0] == 'connect') {
            args[1] = outPortUuid(args[1]);
            args[2] = inPortUuid(args[2]);
        }
        // call (コンポーネント名) ...
        else if (args.length >= 2 && args[0] == 'call') {
            args[1] = comUuid(args[1]);
        }
        // play (サンプリングレート) ...
        else if (args.length >= 2 && args[0] == 'play') {
            if (Number(args[1]) !== sampleRate) {
                console.log(`サンプリングレートは ${sampleRate} のみ対応しています。`);
                args = [];
            }

            onSuccess = (response) => {
                const bufferSize = response.samples.length;
                const buffer = new Buffer(bufferSize * 2);
                for (let i = 0; i < bufferSize; i++) {
                    buffer.writeInt16LE(Math.round(response.samples[i] * 32767), i * 2);
                }
                speaker.write(buffer);
            };
        }

        send(args, onSuccess);
    }

    return isExecuted;
}


rl.prompt();

rl.on('line', (line) => {
    let args = line.replace(/#.*/, '').trim().split(/\s+/);
    if (args[0] === '') args = [];
    commandBuffer.push(args);

    execute();
});

rl.on('close', () => {
    isEof = true;

    if (!execute() && isEof) {
        process.exit(0);
    }
});
