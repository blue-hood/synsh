'use strict'

const { spawn } = require('child_process');
const path = require('path');

let receiveBuffer = "";
let onSuccessHandlers = [];
let onComplete = () => { };

const synth = spawn('synth');
synth.stdout.on('data', (data) => {
    let dataString = data.toString();

    while (dataString !== '') {
        const index = dataString.indexOf("\0");

        if (index != -1) {
            receiveBuffer += dataString.slice(0, index);
            dataString = dataString.slice(index + 1);
            receive(JSON.parse(receiveBuffer).response);
            receiveBuffer = '';
        } else {
            receiveBuffer += dataString;
            dataString = '';
        }
    }
});

synth.stderr.on('data', (data) => {
    console.log(data.toString());
});

const write = (args) => {
    const request = { request: { args: args } };
    synth.stdin.write(JSON.stringify(request) + "\0");
};

const receive = (response) => {
    const onSuccess = onSuccessHandlers.shift();

    if ('error' in response) {
        console.log(response.error);
    } else {
        onSuccess(response);
    }
    if (onSuccessHandlers.length === 0) onComplete();
};

const pushOnSuccessHandler = (handler) => {
    onSuccessHandlers.push(handler);
};

const setOnCompleteHandler = (handler) => {
    onComplete = handler;
};

module.exports = {
    write: write,
    pushOnSuccessHandler: pushOnSuccessHandler,
    setOnCompleteHandler: setOnCompleteHandler,
};
