let decoder = new TextDecoder('utf-8');

var stringReceived = "";
var connectionId = undefined;
var ports = [];
var messagePort = undefined;

function emptyCallback() {}

function serialReceiveHandler(info)
{
    if (info.data)
    {
        console.log(info.data);
        stringReceived += decoder.decode(info.data);
    }
}

function connectHandler(connectionInfo)
{
    console.log("connectionInfo: ", connectionInfo);
    connectionId = connectionInfo.connectionId;
}

function getDevicesHandler(ports)
{
    console.log(ports);
    for(var i = 0; i < ports.length; i++)
    {
        console.log(i, ports[i].path);
    }
}

function connectionHandler(request)
{
    console.log(request);
    switch(request.command)
    {
        case "status":
            break;
        case "list":
            chrome.serial.getDevices(function(ports_found)
            {
                ports = ports_found;
                console.log(ports_found);
                messagePort.postMessage(ports_found);
            });
            break;
        case "control":
            chrome.serial.setControlSignals(connectionId,
            {
                dtr: request.data.dtr,
                rts: request.data.rts
            }, emptyCallback);
            break;
        case "connect":
            var index = request.data.port_index;
            chrome.serial.connect(
                ports[index].path,
                request.data.settings,
                connectHandler);
            break;
        case "disconnect":
            chrome.serial.disconnect(connectionId, emptyCallback);
            break;
        case "update":
            chrome.serial.update(
                connectionId,
                request.data.settings,
                emptyCallback);
            break;
        case "read":
            messagePort.postMessage(stringReceived);
            stringReceived = "";
            break;
        case "write":
            messagePort.postMessage("¯\_(ツ)_/¯");
            break;
        default:
            break;
    }
}

chrome.serial.onReceive.addListener(serialReceiveHandler);
// chrome.runtime.onMessageExternal.addListener(connectionHandler);
chrome.runtime.onConnectExternal.addListener(function(port) {
    console.log(port);
    console.assert(port.name == "serial");
    messagePort = port;
    port.onMessage.addListener(connectionHandler);
});
