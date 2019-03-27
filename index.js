#!/usr/bin/env node
'use strict'

const sampleRate = 44100;

const fs = require('fs');
const Speaker = require('speaker');
const readline = require('readline');
const synth = require('./synth');

const comNameTable = {};
let isCompleted = true;
let isEof = false;
const commandBuffer = [];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
});

const speaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: sampleRate,
});

synth.setOnCompleteHandler(() => {
    isCompleted = true;
    rl.prompt();

    if (!execute() && isEof) {
        process.exit(0);
    }
});

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




const send = (args, onSuccess) => {
    synth.pushOnSuccessHandler(onSuccess);

    for (let index in args) {
        args[index] = args[index].toString();
    }

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
};

const outPortUuid = (arg) => {
    if (arg.match(/^[a-z_][0-9a-z_]*\..*$/) === null) {
        return arg;
    }

    const [comName, outName] = arg.split('.');
    if (!(comName in comNameTable) || !(outName in comNameTable[comName].outputs)) {
        return arg;
    }

    return comNameTable[comName].outputs[outName];
};

const replaceUuid = (string) => {
    const search = (uuid) => {
        for (const name in comNameTable) {
            const com = comNameTable[name];

            if (com.uuid == uuid) {
                return name;
            }

            for (const name in com.inputs) {
                if (com.inputs[name] == uuid) {
                    return name;
                }
            }

            for (const name in com.outputs) {
                if (com.outputs[name] == uuid) {
                    return name;
                }
            }
        }

        return null;
    };

    let pattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
    let found;

    while ((found = pattern.exec(string)) != null) {
        const name = search(found);
        if (name !== null) {
            string = string.substring(0, pattern.lastIndex) + ` (${name}) ` + string.substring(pattern.lastIndex);
        }
    }

    return string;
};

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
                    line += replaceUuid(key.toString()) + ': ';

                    if (value instanceof Object) {
                        console.log(line);
                        printResponse(value, level + 2);
                    } else {
                        line += replaceUuid(value.toString());
                        console.log(line);
                    }

                }
            };

            printResponse(response, 0);
        }

        commands.forEach((command) => {
            if (command.trigger(args)) {
                [args, onSuccess] = command.handler(args, onSuccess);
            }
        });

        send(args, onSuccess);
    }

    return isExecuted;
}

const commands = [
    {   // addcom (component type) as (name)
        trigger: (args) => {
            return args.length == 4 && args[0] == 'addcom' && args[2] == 'as' && isName(args[3]);
        },
        handler: (args, onSuccess) => {
            const name = args[3];
            if (name in comNameTable) {
                console.log("定義済みの名前です。");
                args = [];
                return [args, onSuccess];
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

            return [args, onSuccess];
        },
    },

    {   // connect (出力ポート名) (入力ポート名) ...
        trigger: (args) => {
            return args.length >= 3 && args[0] == 'connect';
        },
        handler: (args, onSuccess) => {
            args[1] = outPortUuid(args[1]);
            args[2] = inPortUuid(args[2]);
            return [args, onSuccess];
        },
    },

    {   // call (コンポーネント名) ...
        trigger: (args) => {
            return args.length >= 2 && args[0] == 'call';
        },
        handler: (args, onSuccess) => {
            args[1] = comUuid(args[1]);
            return [args, onSuccess];
        },
    },

    {   // play speaker (再生時間 [s]) ...
        trigger: (args) => {
            return args.length >= 3 && args[0] == 'play' && args[1] == 'speaker';
        },
        handler: (args, onSuccess) => {
            args[1] = sampleRate;
            args[2] = Math.round(sampleRate * Number(args[2]));

            onSuccess = (response) => {
                const bufferSize = response.samples.length;
                const buffer = new Buffer(bufferSize * 2);
                for (let i = 0; i < bufferSize; i++) {
                    buffer.writeInt16LE(Math.round(response.samples[i] * 32767), i * 2);
                }
                speaker.write(buffer);
            };

            return [args, onSuccess];
        },
    },
    /*
    {
        trigger: (args) => {
            return;
        },
        handler: (args, onSuccess) => {
            return [args, onSuccess];
        },
    },
    */
];

if (process.argv.length >= 3) {
    rl.write(fs.readFileSync(process.argv[2]));
}

