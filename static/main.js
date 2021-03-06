/*
 *    kammce.io - Copyright (C) 2017
 *
 *    This file is part of free software application meant for embedded processors
 *    development and testing. You can use it and/or distribute it as long as this
 *    copyright header remains unmodified.  The code is free for personal, educational,
 *    academic research, and commercial environment use but requires permission
 *    to be used in a commercial product.
 *
 *    THIS SOFTWARE IS PROVIDED "AS IS".  NO WARRANTIES, WHETHER EXPRESS, IMPLIED
 *    OR STATUTORY, INCLUDING, BUT NOT LIMITED TO, IMPLIED WARRANTIES OF
 *    MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE APPLY TO THIS SOFTWARE.
 *    I SHALL NOT, IN ANY CIRCUMSTANCES, BE LIABLE FOR SPECIAL, INCIDENTAL, OR
 *    CONSEQUENTIAL DAMAGES, FOR ANY REASON WHATSOEVER. THIS SOFTWARE MAY NOT BE
 *    SUBLICENSED WITHOUT PERMISSION.
 *
 *    You can reach the author of this software at:
 *         k a m m c e c o r p @ g m a i l . c o m
 */

//===================================
//  CONSTANTS
//===================================

const GRAPHING_OPTIONS = {
    rangeSelector: {
        buttons: [{
            count: 10,
            type: 'second',
            text: '10s'
        }, {
            count: 20,
            type: 'second',
            text: '20s'
        }, {
            count: 30,
            type: 'second',
            text: '30s'
        }, {
            type: 'all',
            text: 'All'
        }],
        inputEnabled: false,
        selected: 0
    },

    title: {
        text: 'Live random data'
    },

    exporting: {
        enabled: true
    },

    series: [{
        name: 'Random data',
        data: (function() {
            // generate first set of data
            var data = [];
            var time = (new Date()).getTime();
            for (var i = -10; i <= 0; i += 1)
            {
                data.push([
                    time + i * 1000,
                    0
                ]);
            }
            return data;
        }())
    }]
};

const DEFAULT_PERIOD    = 1000;
const SUCCESS           = "SUCCESS";
const URL               = window.location.href.replace(/\/$/, "");;
const DOWN_ARROW        = 38;
const UP_ARROW          = 40;
const ENTER_KEY         = 13;

//===================================
//  GLOBALS
//===================================

/*** Strings ***/
var serial              = "";
var telemetry_raw       = "";
var past_commands       = "";
/*** Flags ***/
var table_init          = false;
var device_connected    = false;
var server_connected    = false;
var graph_update_active = false;
var telemetry_flag      = false;
var carriage_return_active = false;
var darktheme_active    = false;
var newline_active      = true;
var scrolled_to_bottom  = true;
/*** Structures ***/
var telemetry           = { };
var graph_options       = { };
var graphs              = { };
var command_history     = [ ];
/*** Timers and Periods ***/
var serial_period       = DEFAULT_PERIOD;
var server_period       = DEFAULT_PERIOD;
var telemetry_period    = DEFAULT_PERIOD;
var graph_period        = DEFAULT_PERIOD;
/*** Counters ***/
var graph_telem_update_ratio = 1;
var redraw_counter      = 0;
var history_position    = 0;

//===================================
//  Utility Functions
//===================================

function setCookie(cname, cvalue, exdays)
{
    var d = new Date();
    d.setTime(d.getTime() + (exdays*24*60*60*1000));
    var expires = "expires="+ d.toUTCString();
    document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
}

function getCookie(cname)
{
    var name = cname + "=";
    var decodedCookie = decodeURIComponent(document.cookie);
    var ca = decodedCookie.split(';');
    for(var i = 0; i <ca.length; i++)
    {
        var c = ca[i];
        while (c.charAt(0) == ' ')
        {
            c = c.substring(1);
        }
        if (c.indexOf(name) == 0)
        {
            return c.substring(name.length, c.length);
        }
    }
    return "";
}

function checkCookie(cookie)
{
    var user = getCookie(cookie);
    var result = false;
    if (user != "")
    {
        result = true;
    }
    return result;
}

//===================================
//  Listeners
//===================================

$("#refresh").on("click", () =>
{
    console.log(`${URL}/list`);
    $.get(`${URL}/list`, function(data)
    {
        var new_list = [];
        if(data)
        {
            try
            {
                new_list = JSON.parse(data);
                console.log(new_list);
            } catch(e) { }
            var list_html = generateDropDownList(new_list);
            $("#device-select").html(list_html);
        }
    });
});

$("#connect").on("click", () =>
{
    if(!device_connected)
    {
        var device = $("#device-select").val();
        console.log(device);
        if(device == "-1")
        {
            alert("Invalid serial device.");
            /* TODO: should show a model stating that connecting failed */
            return;
        }
        $.get(`${URL}/connect?device=${device}`, function(data)
        {
            if(data === SUCCESS)
            {
                device_connected = true;
                $("#connect")
                    .removeClass("btn-outline-success")
                    .addClass("btn-outline-danger")
                    .text("Disconnect");
                $("#serial-baud-select").attr("disabled", "disabled");
            }
            else
            {
                /* TODO: should show a model stating that connecting failed */
                alert("Couldn't connect to device.");
            }
        });
    }
    else
    {
        $.get(`${URL}/disconnect`, function(data)
        {
            if(data === SUCCESS)
            {
                device_connected = false;
                table_init = false;
                telemetry_raw = "\r\n";
                $("#connect")
                    .addClass("btn-outline-success")
                    .removeClass("btn-outline-danger")
                    .text("Connect");
                $("#serial-baud-select").removeAttr("disabled");
            }
        });
    }
});

$("input[name='serial-input']").on('keyup', (e) =>
{
        var count_change_flag = true;
        // console.log(command_history);
        switch(event.which)
        {
            case UP_ARROW:
                if(history_position > 0)
                {
                    history_position--;
                }
                break;
            case DOWN_ARROW:
                if(history_position < command_history.length)
                {
                    history_position++;
                }
                break;
            case ENTER_KEY:
                $("#serial-send").click();
            default:
                count_change_flag = false;
                break;
        }
        if(count_change_flag)
        {
            $("input[name='serial-input']").val(command_history[command_history.length-history_position]);
        }
});

$("#serial-send").on("click", () =>
{
    if(device_connected)
    {
        var payload = $("input[name='serial-input']").val();
        $("input[name='serial-input']").val("");

        if(payload !== command_history[command_history.length-1])
        {
            command_history.push(payload);
            past_commands += '<option value="'+command_history[command_history.length - 1]+'" />';
            document.getElementById('command-history').innerHTML = past_commands;
        }
        history_position = 0;

        var cr = (carriage_return_active) ? "1" : "0";
        var nl = (newline_active) ? "1" : "0";

        $.get(`${URL}/write/${payload}/${cr}/${nl}`, function(data)
        {
            if(data === SUCCESS)
            {
                console.info("WRITE SUCCESS!");
            }
            else
            {
                console.info("WRITE FAILURE!");
            }
        });
    }
});

$("#serial-frequency-select").on("change", () =>
{
    var val = $("#serial-frequency-select").val();
    var frequency = parseInt(val);
    serial_period = (frequency === -1) ? DEFAULT_PERIOD : 1000/frequency;
    setCookie("serial-frequency-select", val, 30);
});

$("#telemetry-frequency-select").on("change", () =>
{
    var val = $("#telemetry-frequency-select").val();
    var frequency = parseInt(val);
    telemetry_period = (frequency === -1) ? DEFAULT_PERIOD : 1000/frequency;
    setCookie("telemetry-frequency-select", val, 30);

    if(telemetry_period > graph_period)
    {
        $("#graph-frequency-select").val(val);
    }

    $("#graph-frequency-select option").filter(function() {
        return $(this).attr("value") > $("#telemetry-frequency-select").val();
    }).attr("disabled", "disabled");

    $("#graph-frequency-select option").filter(function() {
        return $(this).attr("value") <= $("#telemetry-frequency-select").val();
    }).removeAttr("disabled");
});

$("#serial-baud-select").on("change", () =>
{
    var val = $("#serial-baud-select").val();
    $.get(`${URL}/baudrate/${val}`, function(data)
    {
        if(data === SUCCESS) {}
    });
    setCookie("serial-baud-select", val, 30);
});

//Clear Button Code
$("#clear-button").on("click", () =>
{
    // [0m = Reset color codes
    // [3J = Remove terminal buffer
    // [2J = Clear screen
    // [H  = Return to home (0,0)
    term.write("\x1b[0m\x1b[3J\x1b[2J\x1b[H");
});

//Command History Code
$("#clear-cache-modal-open").on("click",() =>
{
  $('#clear-cache-modal').modal('show');
});

$("#clear-cache").on("click", () =>
{
  command_history = [];
  past_commands = ""; 
  document.getElementById('command-history').innerHTML = "";
  localStorage.setItem('command_history', JSON.stringify(command_history));
  console.info("CLEARED COMMAND HISTORY AND CACHE");
});

//Serial File Upload
$("#serial-upload").on("click", () =>
{
  if (device_connected)
  {
    var serial_file = document.getElementById("serial-file").files;
    if (serial_file.length == 0)
    {
      document.getElementById("alert-display").innerHTML = '<p>No file selected</p>';
      console.info("No file");
    }
    else
    {
      var output = '';
      var file = serial_file.item(0);
      var reader = new FileReader();

      reader.onload = function(e)
      {
        output = reader.result;
        $.ajax({
          url: `${URL}/serial-file/`,
          method: "POST",
          headers: {'Content-Type': 'application/json'},
          data: JSON.stringify(output),
          success: function(data)
          {
            if (data === SUCCESS)
            {
              document.getElementById("alert-display").innerHTML = '<p>File upload success!</p>';
              console.info("FILE UPLOAD SUCCESS");
            }
            else
            {
              document.getElementById("alert-display").innerHTML = '<p>File upload failure</p>';
              console.info("FILE UPLOAD FAILURE");
            }
          }
        })
      }
      reader.readAsText(file);
    }
  }

  else
  {
    document.getElementById("alert-display").innerHTML = '<p>Please connect a device before uploading a file</p>';
  }

});

$("#graph-frequency-select").on("change", () =>
{
    var val = $("#graph-frequency-select").val();
    var frequency = parseInt(val);
    graph_period = (frequency === -1) ? DEFAULT_PERIOD : 1000/frequency;
    setCookie("graph-frequency-select", val, 30);
});

$('#rts-control').on('change click', function(e)
{
    var rts_flag = $(this).is(":checked");
    $.get(`${URL}/rts/${rts_flag}`, function(data)
    {
        if(data === SUCCESS) {}
    });
});

$('#dtr-control').on('change click', function(e)
{
    var dtr_flag = $(this).is(":checked");
    $.get(`${URL}/dtr/${dtr_flag}`, function(data)
    {
        if(data === SUCCESS) {}
    });
});

$('#telemetry-on').on('change click', function(e)
{
    telemetry_flag = $(this).is(":checked");
    setCookie("telemetry-on", telemetry_flag, 30);

    var telemetry_feedback_section = $("#telemetry-feedback-section");
    var serial_output_section = $("#serial-output-section");
    var invisible_block = $('#invisible-layer');
    const serial_output_expand = "col-sm-12 col-md-12 col-lg-12";
    const invisible_layer_expand = "col-sm-12 col-md-12 col-lg-11";
    const serial_output_shrink = "col-sm-12 col-md-12 col-lg-5";
    const telemetry_feedback_size = "col-sm-12 col-md-12 col-lg-7";
    const REFIT_TIME_DELAY = 541;

    if(e.type == 'change'){
        if(!telemetry_flag)
        {
            serial_output_section.removeClass(serial_output_shrink).addClass(serial_output_expand);
            invisible_block.removeClass(serial_output_shrink).addClass(invisible_layer_expand);
            telemetry_feedback_section.removeClass(telemetry_feedback_size).addClass('col-lg-1');
        }
        else
        {
           telemetry_feedback_section.find("input").attr("required", true);
           serial_output_section.removeClass(serial_output_expand).addClass(serial_output_shrink);
           invisible_block.removeClass(invisible_layer_expand).addClass(serial_output_shrink);
           telemetry_feedback_section.css('visibility', 'visible').removeClass("col-lg-1").addClass(telemetry_feedback_size);
        }
        setTimeout(function(){
            term.fit();
        }, REFIT_TIME_DELAY);
    }
    else if(e.type = 'click')
    {
        if(!telemetry_flag)
        {
           serial_output_section.css('transition', '0.52s ease-in');
            invisible_block.css('transition', '0.5s ease-in');
            telemetry_feedback_section.css('transition', '0.5s ease-in').hide(540);
        }
        else
        {
           serial_output_section.css('transition', '0.449s ease-in');
           invisible_block.css('transition', '0.5s ease-in');
           telemetry_feedback_section.show().css('transition', '0.5s ease-in');
        }
    }
});

$('#reset-on-connect').on('change', function()
{
    reset_on_connect_flag = $(this).is(":checked");
    setCookie("reset-on-connect", reset_on_connect_flag, 30);
});

$('#graph-switch').on('change', function()
{
    graph_update_active = $(this).is(":checked");
    setCookie("graph-switch", graph_update_active, 30);
});

$('#carriage-return-select').on('change', function()
{
    carriage_return_active = $(this).is(":checked");
    setCookie("carriage-return-active", carriage_return_active, 30);
});

$('#newline-select').on('change', function()
{
    newline_active = $(this).is(":checked");
    setCookie("newline-active", newline_active, 30);
});

$("#dark-theme").on('change', function()
{
    darktheme_active = $(this).is(":checked");
    setCookie("darktheme-active", darktheme_active, 30);
    if(darktheme_active){
        $('head').append('<link rel="stylesheet" type="text/css" id="dark-style" href="static/lib/themes/dark-theme.css" >');
    }else{
        var item = document.getElementById("dark-style");
        item.parentNode.removeChild(item);
    }
});

//===================================
//  Parsers & Generator Functions
//===================================

function telemetrySet(bucket, element)
{
    var new_value = $(`input[name="set-${bucket}-${element}"]`).val();
    $.get(`${URL}/set/${bucket}/${element}/${new_value}`, function(data)
    {
        if(data === SUCCESS) {}
    });
}

function parseTelemetry()
{
    var json = { };


    if(telemetry_raw.indexOf("START:") == -1)
    {
        json = false;
    }
    else
    {
        var buckets = telemetry_raw.split("START:");
        for(bucket of buckets)
        {
            components = bucket.split("\n");
            var current_bucket = components[0].split(":")[0];
            json[current_bucket] = { };

            for(component of components)
            {
                sections = component.split(":");
                switch(sections.length)
                {
                    case 0:
                        break;
                    case 2:
                        break;
                    case 6:
                        json[current_bucket][sections[0]] = {
                            type: sections[4],
                            value: sections[5]
                        };
                        break;
                    default:
                        break;
                }
            }
        }
    }
    return json;
}

function generateDropDownList(new_list)
{
    var html = `<option value="-1">Select Serial Device ...</option>`;
    for(var i = 0; i < new_list.length; i++)
    {
        html += `
            <option
                value="${new_list[i]}"
                ${(i === 0) ? "selected" : ""}>
                ${new_list[i]}
            </option>`;
    }
    return html;
}

function generateTable()
{
    var html = "";

    for(bucket in telemetry)
    {
        for(element in telemetry[bucket])
        {
            html += `
            <tr id="${bucket}-${element}">
                <td>${bucket}</td>
                <td>${element}</td>
                <td>${telemetry[bucket][element]["type"]}</td>
                <td>${telemetry[bucket][element]["value"]}</td>
                <td>
                    <input class="form-control" size="1" type="text" name="set-${bucket}-${element}"/>
                </td>
                <td>
                     <button
                        class="btn btn-outline-success my-2 my-sm-0"
                        id="set-${bucket}-${element}-btn"
                        type="submit"
                        onclick="telemetrySet('${bucket}', '${element}')">Set</button>
                </td>
            </tr>`;
        }
    }
    return html;
}

function generateGraph()
{
    var html = "";
    graph_options = { };

    for(bucket in telemetry)
    {
        for(element in telemetry[bucket])
        {
            title = `${bucket}-${element}`;
            html += `
            <div class="col-lg-4">
                <div id="graph-${title}" style="height: 300px;"></div>
            </div>`;
            var struct = {};
            jQuery.extend(true, struct, GRAPHING_OPTIONS);
            struct.title.text = title;
            struct.series[0].name = element;
            graph_options[`graph-${title}`] = struct;
        }
    }
    return html;
}

function intializeGraphs()
{
    graph = { };
    for(graph in graph_options)
    {
        graphs[graph] = Highcharts.stockChart(graph, graph_options[graph])
    }
}

function updateTable()
{
    for(bucket in telemetry)
    {
        for(element in telemetry[bucket])
        {
            var select = `#${bucket}-${element} td`;
            var cell = $(select)[3];
            $(cell).html(telemetry[bucket][element]["value"]);
        }
    }
}

function updateGraph()
{
    for(bucket in telemetry)
    {
        for(element in telemetry[bucket])
        {
            var select = `graph-${bucket}-${element}`;
            var x = (new Date()).getTime();
            var y = parseFloat(telemetry[bucket][element]["value"]);
            try
            {
                graphs[select].series[0].addPoint([x, y], false, false);
            }
            catch(e)
            {
                return false;
            }
        }
    }
    return true;
}

//===================================
//  Timer Functions
//===================================

function getTelemetry()
{
    if(device_connected && server_connected && telemetry_flag)
    {
        $.get(`${URL}/telemetry`, function (data)
        {
            console.log(data);
            if(data === "\r\n" || data === "")
            {
                console.log("rejecting");
                return;
            }
            graph_telem_update_ratio = (graph_period / telemetry_period);
            if(data !== telemetry_raw)
            {
                telemetry_raw = data;
                $("#telemetry-raw").val(data);
                var temp = parseTelemetry(data);
                if(temp != false)
                {
                    telemetry = temp;
                }
                else
                {
                    return;
                }
                if(!table_init)
                {
                    console.log("Initialize telemetry feedback", telemetry, telemetry_raw);
                    var table_html = generateTable(telemetry);
                    $("#telemetry-table tbody").html(table_html);
                    var graph_html = generateGraph(telemetry);
                    $("#graph-holder").html(graph_html);
                    intializeGraphs();
                    table_init = true;
                }
                else
                {
                    updateTable();
                    if(graph_update_active)
                    {
                        updateGraph();
                        if(redraw_counter >= graph_telem_update_ratio)
                        {
                            for(graph in graphs)
                            {
                                graphs[graph].redraw();
                            }
                            redraw_counter = 0;
                        }
                        redraw_counter++;
                    }
                }
            }
        });
    }
    setTimeout(getTelemetry, telemetry_period);
}

function getSerial()
{
    if(device_connected && server_connected)
    {
        $.ajax({
            url: `${URL}/serial`,
            type: 'GET',
            success: (data) =>
            {
                if(data !== serial)
                {
                    serial = data;
                    data = data.replace(/\n/g, '\r\n');
                    term.write(data);
                }
            },
            error: () =>
            {
                console.log("400 error!");
                device_connected = false;

                $("#connect")
                    .addClass("btn-outline-success")
                    .removeClass("btn-outline-danger")
                    .text("Connect");

                $("#refresh").click();

                $('#serial-disconnect-modal').modal('show');
            }
        });
    }
    setTimeout(getSerial, serial_period);
}

function checkConnection()
{
    $.ajax({
        url: `${URL}/server-is-alive`,
        type: 'GET',
        success: () =>
        {
            server_connected = true;
            $("#server-connection-indicator").removeClass("disconnected-text").addClass("connected-text");
            setTimeout(checkConnection, server_period);
        },
        error: () =>
        {
            server_connected = false;
            $("#server-connection-indicator").removeClass("connected-text").addClass("disconnected-text");
            $('#server-disconnect-modal').modal('show');
        }
    });
}

//===================================
//  Local Cache Functions
//===================================

function getCache()
{
  if (localStorage.getItem('command_history') != null)
  {
    var get_storage = JSON.parse(localStorage.getItem('command_history'));
    command_history = get_storage;
    for(var i = 0; i < command_history.length; i++)
    {
        past_commands += '<option value="'+command_history[i]+'" />';
    }
    document.getElementById('command-history').innerHTML = past_commands;
    console.info("COMMAND CACHE RETRIEVED");
  }

  else
  {
    command_history = [];
    console.info("NO COMMAND CACHE");
  }
}

window.onbeforeunload = function setCache()
{
  if (command_history.length > 100)
  {
    var sliced_history = [];
    cached_history = command_history.slice(0,99);
    localStorage.setItem('command_history', JSON.stringify(sliced_history));
  }
  else {
    localStorage.setItem('command_history', JSON.stringify(command_history));
  }
}

//===================================
//  Initialize everything
//===================================

Terminal.applyAddon(fit);

var term = new Terminal({
    // bellSound: "both",
    // bellStyle: "sound",
    cursorBlink: true,
    lineHeight: 1,
    fontFamily: "monospace",
    scrollback: 1024,
});

$(window).resize(() => {
    term.fit();
});

term.on('key', function (key, ev) {
    if(ev.code == "Backspace")
    {
        key = "\b";
    }
    if(key == "\r")
    {
        key += "\n";
    }
    $.get(`${URL}/write/${encodeURIComponent(key)}/0/0`, function(data)
    {
        if(data === SUCCESS)
        {
            console.info("WRITE SUCCESS!");
        }
        else
        {
            console.info("WRITE FAILURE!");
        }
    });
});

term.on('linefeed', function (key, ev) {
    console.log("linefeed!");
});

term.on('data', function (data, ev) {
    console.log(data);
});

window.onload = function()
{
    setTimeout(function()
    {
        term.open(document.querySelector('#terminal'));
        term.fit();
        checkConnection();
        getSerial();
        getTelemetry();
        getCache();
        $("#refresh").click();

        $("#telemetry-feedback-section").css('display', '');
        //// TODO: Convert the items below into a for loop
        if(checkCookie('telemetry-on'))
        {
            $("#telemetry-on").prop("checked", getCookie("telemetry-on") === "true");
            $("#telemetry-on").change();
            if(!telemetry_flag)
            {
                $("#telemetry-feedback-section").css('visibility', 'hidden');
            }
            else
            {
                $("#telemetry-feedback-section").css('visibility', 'visible');
            }
        }
        if(checkCookie("reset-on-connect"))
        {
            $("#reset-on-connect").prop("checked", getCookie("reset-on-connect") === "true");
            $("#reset-on-connect").change();
        }
        if(checkCookie("carriage-return-active"))
        {
            $("#carriage-return-select").prop("checked", getCookie("carriage-return-active") === "true");
            $("#carriage-return-select").change();
        }
        if(checkCookie("newline-active"))
        {
            $("#newline-select").prop("checked", getCookie("newline-active") === "true");
            $("#newline-select").change();
        }
        if(checkCookie("darktheme-active"))
        {
            $("#dark-theme").prop("checked", getCookie("darktheme-active") === "true");
            $("#dark-theme").change();
        }
        if(checkCookie("serial-frequency-select"))
        {
            $("#serial-frequency-select").val(getCookie("serial-frequency-select"));
            $("#serial-frequency-select").change();
        }
        if(checkCookie("telemetry-frequency-select"))
        {
            $("#telemetry-frequency-select").val(getCookie("telemetry-frequency-select"));
            $("#telemetry-frequency-select").change();
        }
        if(checkCookie("graph-switch"))
        {
            $("#graph-switch").prop("checked", getCookie("graph-switch") === "true");
            $("#graph-switch").change();
        }
        if(checkCookie("graph-frequency-select"))
        {
            $("#graph-frequency-select").val(getCookie("graph-frequency-select"));
            $("#graph-frequency-select").change();
        }
        if(checkCookie("serial-baud-select"))
        {
            $("#serial-baud-select").val(getCookie("serial-baud-select"));
            $("#serial-baud-select").change();
        }
    }, 100);
};
