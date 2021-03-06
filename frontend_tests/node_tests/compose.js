set_global('$', global.make_zjquery());
set_global('i18n', global.stub_i18n);

set_global('page_params', {
    use_websockets: true,
});

set_global('navigator', {});
set_global('document', {
    getElementById: function () { return $('#compose-textarea'); },
    execCommand: function () { return false; },
    location: {},
});
set_global('channel', {});
set_global('templates', {});

var noop = function () {};

set_global('blueslip', {});
set_global('drafts', {
    delete_draft_after_send: noop,
});
set_global('resize', {
    resize_bottom_whitespace: noop,
});
set_global('feature_flags', {
    resize_bottom_whitespace: noop,
});
set_global('echo', {});
set_global('socket', {});
set_global('Socket', function () {
    return global.socket;
});
set_global('stream_edit', {});
set_global('markdown', {});
set_global('loading', {});

set_global('sent_messages', {
    start_tracking_message: noop,
    report_server_ack: noop,
});

// Setting these up so that we can test that links to uploads within messages are
// automatically converted to server relative links.
global.document.location.protocol = 'https:';
global.document.location.host = 'foo.com';

zrequire('compose_ui');
zrequire('util');
zrequire('common');
zrequire('Handlebars', 'handlebars');
zrequire('stream_data');
zrequire('compose_state');
zrequire('people');
zrequire('compose');
zrequire('upload');
page_params.use_websockets = false;

var me = {
    email: 'me@example.com',
    user_id: 30,
    full_name: 'Me Myself',
};

var alice = {
    email: 'alice@example.com',
    user_id: 31,
    full_name: 'Alice',
};

var bob = {
    email: 'bob@example.com',
    user_id: 32,
    full_name: 'Bob',
};

people.add(me);
people.initialize_current_user(me.user_id);

people.add(alice);
people.add(bob);

(function test_update_email() {
    compose_state.recipient('');
    assert.equal(compose.update_email(), undefined);

    compose_state.recipient('bob@example.com');
    compose.update_email(32, 'bob_alias@example.com');
    assert.equal(compose_state.recipient(), 'bob_alias@example.com');
}());

(function test_validate_stream_message_address_info() {
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);
    assert(compose.validate_stream_message_address_info('social'));

    $('#stream').select(noop);
    assert(!compose.validate_stream_message_address_info('foobar'));
    assert.equal($('#compose-error-msg').html(), "<p>The stream <b>foobar</b> does not exist.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    sub.subscribed = false;
    stream_data.add_sub('social', sub);
    assert(!compose.validate_stream_message_address_info('social'));
    assert.equal($('#compose-error-msg').html(), "<p>You're not subscribed to the stream <b>social</b>.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    global.page_params.narrow_stream = false;
    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'social');
        payload.data.subscribed = true;
        payload.success(payload.data);
    };
    assert(compose.validate_stream_message_address_info('social'));

    sub.name = 'Frontend';
    sub.stream_id = 102;
    stream_data.add_sub('Frontend', sub);
    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'Frontend');
        payload.data.subscribed = false;
        payload.success(payload.data);
    };
    assert(!compose.validate_stream_message_address_info('Frontend'));
    assert.equal($('#compose-error-msg').html(), "<p>You're not subscribed to the stream <b>Frontend</b>.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'Frontend');
        payload.error({status: 404});
    };
    assert(!compose.validate_stream_message_address_info('Frontend'));
    assert.equal($('#compose-error-msg').html(), "<p>The stream <b>Frontend</b> does not exist.</p><p>Manage your subscriptions <a href='#streams/all'>on your Streams page</a>.</p>");

    channel.post = function (payload) {
        assert.equal(payload.data.stream, 'social');
        payload.error({status: 500});
    };
    assert(!compose.validate_stream_message_address_info('social'));
    assert.equal($('#compose-error-msg').html(), i18n.t("Error checking subscription"));
}());

(function test_validate() {
    $("#compose-send-button").prop('disabled', false);
    $("#compose-send-button").focus();
    $("#sending-indicator").hide();
    $("#compose-textarea").select(noop);
    assert(!compose.validate());
    assert(!$("#sending-indicator").visible());
    assert(!$("#compose-send-button").is_focused());
    assert.equal($("#compose-send-button").prop('disabled'), false);
    assert.equal($('#compose-error-msg').html(), i18n.t('You have nothing to send!'));

    $("#compose-textarea").val('foobarfoobar');
    var zephyr_checked = false;
    $("#zephyr-mirror-error").is = function () {
        if (!zephyr_checked) {
            zephyr_checked = true;
            return true;
        }
        return false;
    };
    assert(!compose.validate());
    assert(zephyr_checked);
    assert.equal($('#compose-error-msg').html(), i18n.t('You need to be running Zephyr mirroring in order to send messages!'));

    compose_state.set_message_type('private');
    compose_state.recipient('');
    $("#private_message_recipient").select(noop);
    assert(!compose.validate());
    assert.equal($('#compose-error-msg').html(), i18n.t('Please specify at least one recipient'));

    compose_state.recipient('foo@zulip.com');
    global.page_params.realm_is_zephyr_mirror_realm = true;
    assert(compose.validate());

    global.page_params.realm_is_zephyr_mirror_realm = false;
    assert(!compose.validate());
    assert.equal($('#compose-error-msg').html(), i18n.t('The recipient foo@zulip.com is not valid', {}));

    compose_state.recipient('foo@zulip.com,alice@zulip.com');
    assert(!compose.validate());
    assert.equal($('#compose-error-msg').html(), i18n.t('The recipients foo@zulip.com,alice@zulip.com are not valid', {}));

    people.add_in_realm(bob);
    compose_state.recipient('bob@example.com');
    assert(compose.validate());

    compose_state.set_message_type('stream');
    compose_state.stream_name('');
    $("#stream").select(noop);
    assert(!compose.validate());
    assert.equal($('#compose-error-msg').html(), i18n.t('Please specify a stream'));

    compose_state.stream_name('Denmark');
    global.page_params.realm_mandatory_topics = true;
    compose_state.subject('');
    $("#subject").select(noop);
    assert(!compose.validate());
    assert.equal($('#compose-error-msg').html(), i18n.t('Please specify a topic'));
}());

(function test_get_invalid_recipient_emails() {
    var feedback_bot = {
        email: 'feedback@example.com',
        user_id: 124,
        full_name: 'Feedback Bot',
    };
    global.page_params.cross_realm_bots = [feedback_bot];
    global.page_params.user_id = 30;
    people.initialize();
    compose_state.recipient('feedback@example.com');
    assert.deepEqual(compose.get_invalid_recipient_emails(), []);
}());

(function test_validate_stream_message() {
    // This test is in kind of continuation to test_validate but since it is
    // primarily used to get coverage over functions called from validate()
    // we are separating it up in different test. Though their relative position
    // of execution should not be changed.
    global.page_params.realm_mandatory_topics = false;
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);
    compose_state.stream_name('social');
    assert(compose.validate());
    assert(!$("#compose-all-everyone").visible());
    assert(!$("#compose-send-status").visible());

    stream_data.get_subscriber_count = function (stream_name) {
        assert.equal(stream_name, 'social');
        return 16;
    };
    global.templates.render = function (template_name, data) {
        assert.equal(template_name, 'compose_all_everyone');
        assert.equal(data.count, 16);
        return 'compose_all_everyone_stub';
    };
    $('#compose-all-everyone').is = function (sel) {
        if (sel === ':visible') {
            return $('#compose-all-everyone').visible();
        }
    };
    var compose_content;
    $('#compose-all-everyone').append = function (data) {
        compose_content = data;
    };
    compose_state.message_content('Hey @all');
    assert(!compose.validate());
    assert.equal($("#compose-send-button").prop('disabled'), false);
    assert(!$("#compose-send-status").visible());
    assert.equal(compose_content, 'compose_all_everyone_stub');
    assert($("#compose-all-everyone").visible());
}());

(function test_markdown_shortcuts() {
    blueslip.error = noop;
    blueslip.log = noop;

    var queryCommandEnabled = true;
    var event = {
        keyCode: 66,
        target: {
            id: 'compose-textarea',
        },
        stopPropagation: noop,
        preventDefault: noop,
    };
    var input_text = "";
    var range_start = 0;
    var range_length = 0;
    var compose_value = $("#compose_textarea").val();
    var selected_word = "";

    global.document.queryCommandEnabled = function () {
        return queryCommandEnabled;
    };
    global.document.execCommand = function (cmd, bool, markdown) {
        var compose_textarea = $("#compose-textarea");
        var value = compose_textarea.val();
        $("#compose-textarea").val(value.substring(0, compose_textarea.range().start)+
            markdown+value.substring(compose_textarea.range().end, value.length));
    };

    $("#compose-textarea").range = function () {
        return {
            start: range_start,
            end: range_start + range_length,
            length: range_length,
            range: noop,
            text: $("#compose-textarea").val().substring(range_start, range_length+range_start),
        };
    };
    $('#compose-textarea').caret = noop;

    // Test bold: ctrl/cmd + b.
    input_text = "Anything bold.";
    $("#compose-textarea").val(input_text);
    compose_value = $("#compose-textarea").val();
    // Select "bold" word in compose box.
    selected_word = "bold";
    range_start = compose_value.search(selected_word);
    range_length = selected_word.length;
    event.keyCode = 66;
    event.metaKey = false;
    event.ctrlKey = true;
    compose.handle_keydown(event);
    assert.equal("Anything **bold**.", $('#compose-textarea').val());
    // Test if no text is selected.
    // Change cursor to first position.
    range_start = 0;
    range_length = 0;
    compose.handle_keydown(event);
    assert.equal("****Anything **bold**.", $('#compose-textarea').val());

    // Test italic: ctrl/cmd + i.
    input_text = "Anything italic";
    $("#compose-textarea").val(input_text);
    $("#compose-textarea").val(input_text);
    compose_value = $("#compose-textarea").val();
    // Select "italic" word in compose box.
    selected_word = "italic";
    range_start = compose_value.search(selected_word);
    range_length = selected_word.length;
    event.keyCode = undefined;
    event.which = 73;
    event.metaKey = true;
    event.ctrlKey = false;
    compose.handle_keydown(event);
    assert.equal("Anything *italic*", $('#compose-textarea').val());
    // Test if no text is selected.
    range_length = 0;
    // Change cursor to first position.
    range_start = 0;
    compose.handle_keydown(event);
    assert.equal("**Anything *italic*", $('#compose-textarea').val());

    // Test link insertion: ctrl/cmd + l.
    input_text = "Any link.";
    $("#compose-textarea").val(input_text);
    compose_value = $("#compose-textarea").val();
    // Select "link" word in compose box.
    selected_word = "link";
    range_start = compose_value.search(selected_word);
    range_length = selected_word.length;
    event.keyCode = 76;
    event.which = undefined;
    event.ctrlKey = true;
    compose.handle_keydown(event);
    assert.equal("Any [link](url).", $('#compose-textarea').val());
    // Test if exec command is not enabled in browser.
    queryCommandEnabled = false;
    compose.handle_keydown(event);

}());

(function test_send_message_success() {
    blueslip.error = noop;
    blueslip.log = noop;
    $("#compose-textarea").val('foobarfoobar');
    $("#compose-textarea").blur();
    $("#compose-send-status").show();
    $("#compose-send-button").attr('disabled', 'disabled');
    $("#sending-indicator").show();

    var reify_message_id_checked;
    echo.reify_message_id = function (local_id, message_id) {
        assert.equal(local_id, 1001);
        assert.equal(message_id, 12);
        reify_message_id_checked = true;
    };

    compose.send_message_success(1001, 12, false);

    assert.equal($("#compose-textarea").val(), '');
    assert($("#compose-textarea").is_focused());
    assert(!$("#compose-send-status").visible());
    assert.equal($("#compose-send-button").prop('disabled'), false);
    assert(!$("#sending-indicator").visible());

    assert(reify_message_id_checked);
}());

(function test_send_message() {
    // This is the common setup stuff for all of the four tests.
    var stub_state;
    function initialize_state_stub_dict() {
        stub_state = {};
        stub_state.local_id_counter = 0;
        stub_state.send_msg_ajax_post_called = 0;
        stub_state.get_events_running_called = 0;
        stub_state.reify_message_id_checked = 0;
        return stub_state;
    }

    global.patch_builtin('setTimeout', function (func) {
        func();
    });
    global.server_events = {
        assert_get_events_running: function () {
            stub_state.get_events_running_called += 1;
        },
    };

    // Tests start here.
    (function test_message_send_success_codepath() {
        stub_state = initialize_state_stub_dict();
        compose_state.subject('');
        compose_state.set_message_type('private');
        page_params.user_id = 101;
        compose_state.recipient('alice@example.com');
        echo.try_deliver_locally = function () {
            stub_state.local_id_counter += 1;
            return stub_state.local_id_counter;
        };
        channel.post = function (payload) {
            var single_msg = {
              type: 'private',
              content: '[foobar](/user_uploads/123456)',
              sender_id: 101,
              queue_id: undefined,
              stream: '',
              subject: '',
              to: '["alice@example.com"]',
              reply_to: 'alice@example.com',
              private_message_recipient: 'alice@example.com',
              to_user_ids: '31',
              local_id: 1,
              locally_echoed: true,
            };
            assert.equal(payload.url, '/json/messages');
            assert.equal(_.keys(payload.data).length, 12);
            assert.deepEqual(payload.data, single_msg);
            payload.data.id = stub_state.local_id_counter;
            payload.success(payload.data);
            stub_state.send_msg_ajax_post_called += 1;
        };
        echo.reify_message_id = function (local_id, message_id) {
            assert.equal(typeof(local_id), 'number');
            assert.equal(typeof(message_id), 'number');
            stub_state.reify_message_id_checked += 1;
        };

        // Setting message content with a host server link and we will assert
        // later that this has been converted to a relative link.
        $("#compose-textarea").val('[foobar]' +
                                      '(https://foo.com/user_uploads/123456)');
        $("#compose-textarea").blur();
        $("#compose-send-status").show();
        $("#compose-send-button").attr('disabled', 'disabled');
        $("#sending-indicator").show();

        compose.send_message();

        var state = {
            local_id_counter: 1,
            get_events_running_called: 1,
            reify_message_id_checked: 1,
            send_msg_ajax_post_called: 1,
        };
        assert.deepEqual(stub_state, state);
        assert.equal($("#compose-textarea").val(), '');
        assert($("#compose-textarea").is_focused());
        assert(!$("#compose-send-status").visible());
        assert.equal($("#compose-send-button").prop('disabled'), false);
        assert(!$("#sending-indicator").visible());
    }());

    (function test_error_code_path_when_error_type_not_timeout() {
        stub_state = initialize_state_stub_dict();
        compose_state.set_message_type('stream');
        var server_error_triggered = false;
        channel.post = function (payload) {
            payload.error('500', 'Internal Server Error');
            stub_state.send_msg_ajax_post_called += 1;
            server_error_triggered = true;
        };
        var reload_initiate_triggered = false;
        global.reload = {
            is_pending: function () { return true; },
            initiate: function () {
                reload_initiate_triggered = true;
            },
        };

        compose.send_message();

        var state = {
            local_id_counter: 1,
            get_events_running_called: 1,
            reify_message_id_checked: 0,
            send_msg_ajax_post_called: 1,
        };
        assert.deepEqual(stub_state, state);
        assert(server_error_triggered);
        assert(reload_initiate_triggered);
    }());

    // This is the additional setup which is common to both the tests below.
    var server_error_triggered = false;
    var reload_initiate_triggered = false;
    channel.post = function (payload) {
        payload.error('408', 'timeout');
        stub_state.send_msg_ajax_post_called += 1;
        server_error_triggered = true;
    };
    var xhr_error_msg_checked = false;
    channel.xhr_error_message = function (error, xhr) {
        assert.equal(error, 'Error sending message');
        assert.equal(xhr, '408');
        xhr_error_msg_checked = true;
        return 'Error sending message: Server says 408';
    };
    var echo_error_msg_checked = false;
    echo.message_send_error = function (local_id, error_response) {
        assert.equal(local_id, 1);
        assert.equal(error_response, 'Error sending message: Server says 408');
        echo_error_msg_checked = true;
    };

    // Tests start here.
    (function test_param_error_function_passed_from_send_message() {
        stub_state = initialize_state_stub_dict();

        compose.send_message();

        var state = {
            local_id_counter: 1,
            get_events_running_called: 1,
            reify_message_id_checked: 0,
            send_msg_ajax_post_called: 1,
        };
        assert.deepEqual(stub_state, state);
        assert(server_error_triggered);
        assert(!reload_initiate_triggered);
        assert(xhr_error_msg_checked);
        assert(echo_error_msg_checked);
    }());

    (function test_error_codepath_local_id_undefined() {
        stub_state = initialize_state_stub_dict();
        $("#compose-textarea").val('foobarfoobar');
        $("#compose-textarea").blur();
        $("#compose-send-status").show();
        $("#compose-send-button").attr('disabled', 'disabled');
        $("#sending-indicator").show();
        $("#compose-textarea").select(noop);
        echo_error_msg_checked = false;
        xhr_error_msg_checked = false;
        server_error_triggered = false;
        reload_initiate_triggered = false;
        echo.try_deliver_locally = function () {
            return;
        };

        sent_messages.get_new_local_id = function () {
            return 'loc-55';
        };

        compose.send_message();

        var state = {
            local_id_counter: 0,
            get_events_running_called: 1,
            reify_message_id_checked: 0,
            send_msg_ajax_post_called: 1,
        };
        assert.deepEqual(stub_state, state);
        assert(server_error_triggered);
        assert(!reload_initiate_triggered);
        assert(xhr_error_msg_checked);
        assert(!echo_error_msg_checked);
        assert.equal($("#compose-send-button").prop('disabled'), false);
        assert.equal($('#compose-error-msg').html(),
                       'Error sending message: Server says 408');
        assert.equal($("#compose-textarea").val(), 'foobarfoobar');
        assert($("#compose-textarea").is_focused());
        assert($("#compose-send-status").visible());
        assert.equal($("#compose-send-button").prop('disabled'), false);
        assert(!$("#sending-indicator").visible());
    }());
}());

(function test_enter_with_preview_open() {
    // Test sending a message with content.
    $("#compose-textarea").val('message me');
    $("#compose-textarea").hide();
    $("#undo_markdown_preview").show();
    $("#preview_message_area").show();
    $("#markdown_preview").hide();
    page_params.enter_sends = true;
    var send_message_called = false;
    compose.send_message = function () {
        send_message_called = true;
    };
    compose.enter_with_preview_open();
    assert($("#compose-textarea").visible());
    assert(!$("#undo_markdown_preview").visible());
    assert(!$("#preview_message_area").visible());
    assert($("#markdown_preview").visible());
    assert(send_message_called);

    page_params.enter_sends = false;
    $("#compose-textarea").blur();
    compose.enter_with_preview_open();
    assert($("#compose-textarea").is_focused());

    // Test sending a message without content.
    $("#compose-textarea").val('');
    $("#preview_message_area").show();
    $("#enter_sends").prop("checked", true);
    page_params.enter_sends = true;

    compose.enter_with_preview_open();

    assert($("#enter_sends").prop("checked"));
    assert.equal($("#compose-error-msg").html(), i18n.t('You have nothing to send!'));
}());

(function test_finish() {
    (function test_when_compose_validation_fails() {
        $("#compose_invite_users").show();
        $("#compose-send-button").prop('disabled', false);
        $("#compose-send-button").focus();
        $("#sending-indicator").hide();
        $("#compose-textarea").select(noop);
        $("#compose-textarea").val('');
        var res = compose.finish();
        assert.equal(res, false);
        assert(!$("#compose_invite_users").visible());
        assert(!$("#sending-indicator").visible());
        assert(!$("#compose-send-button").is_focused());
        assert.equal($("#compose-send-button").prop('disabled'), false);
        assert.equal($('#compose-error-msg').html(), i18n.t('You have nothing to send!'));
    }());

    (function test_when_compose_validation_succeed() {
        $("#compose-textarea").hide();
        $("#undo_markdown_preview").show();
        $("#preview_message_area").show();
        $("#markdown_preview").hide();
        $("#compose-textarea").val('foobarfoobar');
        compose_state.set_message_type('private');
        compose_state.recipient('bob@example.com');
        var compose_finished_event_checked = false;
        $.stub_selector(document, {
            trigger: function (e) {
                assert.equal(e.name, 'compose_finished.zulip');
                compose_finished_event_checked = true;
            },
        });
        var send_message_called = false;
        compose.send_message = function () {
            send_message_called = true;
        };
        assert(compose.finish());
        assert($("#compose-textarea").visible());
        assert(!$("#undo_markdown_preview").visible());
        assert(!$("#preview_message_area").visible());
        assert($("#markdown_preview").visible());
        assert(send_message_called);
        assert(compose_finished_event_checked);
    }());
}());

(function test_abort_xhr() {
    $("#compose-send-button").attr('disabled', 'disabled');
    var compose_removedata_checked = false;
    $('#compose').removeData = function (sel) {
        assert.equal(sel, 'filedrop_xhr');
        compose_removedata_checked = true;
    };
    var xhr_abort_checked = false;
    $("#compose").data = function (sel) {
        assert.equal(sel, 'filedrop_xhr');
        return {
            abort: function () {
                xhr_abort_checked = true;
            },
        };
    };
    compose.abort_xhr();
    assert.equal($("#compose-send-button").attr(), undefined);
    assert(xhr_abort_checked);
    assert(compose_removedata_checked);
}());

function verify_filedrop_payload(payload) {
    assert.equal(payload.url, '/json/user_uploads');
    assert.equal(payload.fallback_id, 'file_input');
    assert.equal(payload.paramname, 'file');
    assert.equal(payload.maxfilesize, 512);
    assert.equal(payload.data.csrfmiddlewaretoken, 'fake-csrf-token');
    assert.deepEqual(payload.raw_droppable, ['text/uri-list', 'text/plain']);
    assert.equal(typeof(payload.drop), 'function');
    assert.equal(typeof(payload.progressUpdated), 'function');
    assert.equal(typeof(payload.error), 'function');
    assert.equal(typeof(payload.uploadFinished), 'function');
    assert.equal(typeof(payload.rawDrop), 'function');
}

function test_raw_file_drop(raw_drop_func) {
    compose_state.set_message_type(false);
    var compose_actions_start_checked = false;
    global.compose_actions = {
        start: function (msg_type) {
            assert.equal(msg_type, 'stream');
            compose_actions_start_checked = true;
        },
    };
    $("#compose-textarea").val('Old content ');
    var compose_ui_autosize_textarea_checked = false;
    compose_ui.autosize_textarea = function () {
        compose_ui_autosize_textarea_checked = true;
    };

    // Call the method here!
    raw_drop_func('new contents');

    assert(compose_actions_start_checked);
    assert.equal($("#compose-textarea").val(), 'Old content new contents');
    assert(compose_ui_autosize_textarea_checked);
}

(function test_initialize() {
    // In this test we mostly do the setup stuff in addition to testing the
    // normal workflow of the function. All the tests for the on functions are
    // done in subsequent tests directly below this test.

    var resize_watch_manual_resize_checked = false;
    resize.watch_manual_resize = function (elem) {
        assert.equal('#compose-textarea', elem);
        resize_watch_manual_resize_checked = true;
    };
    global.window = {
        XMLHttpRequest: true,
        bridge: true,
    };
    var xmlhttprequest_checked = false;
    set_global('XMLHttpRequest', function () {
        this.upload = true;
        xmlhttprequest_checked = true;
    });
    $("#compose #attach_files").addClass("notdisplayed");

    global.document = 'document-stub';
    global.csrf_token = 'fake-csrf-token';

    var filedrop_in_compose_checked = false;
    page_params.maxfilesize = 512;
    $("#compose").filedrop = function (payload) {
        verify_filedrop_payload(payload);
        test_raw_file_drop(payload.rawDrop);

        filedrop_in_compose_checked = true;
    };

    compose.initialize();

    assert(resize_watch_manual_resize_checked);
    assert(xmlhttprequest_checked);
    assert(!$("#compose #attach_files").hasClass("notdisplayed"));
    assert(filedrop_in_compose_checked);

    function reset_jquery() {
        // Avoid leaks.
        set_global('$', global.make_zjquery());

        // Bypass filedrop (we already tested it above).
        $("#compose").filedrop = noop;
    }

    var compose_actions_start_checked;

    function set_up_compose_start_mock(expected_opts) {
        compose_actions_start_checked = false;

        global.compose_actions = {
            start: function (msg_type, opts) {
                assert.equal(msg_type, 'stream');
                assert.deepEqual(opts, expected_opts);
                compose_actions_start_checked = true;
            },
        };
    }

    (function test_page_params_narrow_path() {
        page_params.narrow = true;

        reset_jquery();
        set_up_compose_start_mock({});

        compose.initialize();

        assert(compose_actions_start_checked);
    }());

    (function test_page_params_narrow_topic() {
        page_params.narrow_topic = 'testing';

        reset_jquery();
        set_up_compose_start_mock({subject: 'testing'});

        compose.initialize();

        assert(compose_actions_start_checked);
    }());
}());

function test_with_mock_socket(test_params) {
    var socket_send_called;
    var send_args = {};

    global.socket.send = function (request, success, error) {
        global.socket.send = undefined;
        socket_send_called = true;

        // Save off args for check_send_args callback.
        send_args.request = request;
        send_args.success = success;
        send_args.error = error;
    };

    // Run the actual code here.
    test_params.run_code();

    assert(socket_send_called);
    test_params.check_send_args(send_args);
}

(function test_transmit_message() {
    page_params.use_websockets = true;
    global.navigator.userAgent = 'unittest_transmit_message';

    // Our request is mostly unimportant, except that the
    // socket_user_agent field will be added.
    var request = {foo: 'bar'};

    var success_func_checked = false;
    var success = function () {
        success_func_checked = true;
    };

    // Our error function gets wrapped, so we set up a real
    // function to test the wrapping mechanism.
    var error_func_checked = false;
    var error = function (error_msg) {
        assert.equal(error_msg, 'Error sending message: simulated_error');
        error_func_checked = true;
    };

    test_with_mock_socket({
        run_code: function () {
            compose.transmit_message(request, success, error);
        },
        check_send_args: function (send_args) {
            // The real code patches new data on the request, rather
            // than making a copy, so we test both that it didn't
            // clone the object and that it did add a field.
            assert.equal(send_args.request, request);
            assert.deepEqual(send_args.request, {
                foo: 'bar',
                socket_user_agent: 'unittest_transmit_message',
            });

            send_args.success({});
            assert(success_func_checked);

            // Our error function does get wrapped, so we test by
            // using socket.send's error callback, which should
            // invoke our test error function via a wrapper
            // function in the real code.
            send_args.error('response', {msg: 'simulated_error'});
            assert(error_func_checked);
        },
    });
}());

(function test_update_fade() {
    var selector = '#stream,#subject,#private_message_recipient';
    var keyup_handler_func = $(selector).get_on_handler('keyup');

    var set_focused_recipient_checked = false;
    var update_faded_messages_checked = false;

    global.compose_fade = {
        set_focused_recipient: function (msg_type) {
            assert.equal(msg_type, 'private');
            set_focused_recipient_checked = true;
        },
        update_faded_messages: function () {
            update_faded_messages_checked = true;
        },
    };

    compose_state.set_message_type(false);
    keyup_handler_func();
    assert(!set_focused_recipient_checked);
    assert(!update_faded_messages_checked);

    compose_state.set_message_type('private');
    keyup_handler_func();
    assert(set_focused_recipient_checked);
    assert(update_faded_messages_checked);
}());

(function test_trigger_submit_compose_form() {
    var prevent_default_checked = false;
    var compose_finish_checked = false;
    var e = {
        preventDefault: function () {
            prevent_default_checked = true;
        },
    };
    compose.finish = function () {
        compose_finish_checked = true;
    };

    var submit_handler = $('#compose form').get_on_handler('submit');

    submit_handler(e);

    assert(prevent_default_checked);
    assert(compose_finish_checked);
}());

(function test_on_events() {
    (function test_usermention_completed_zulip_triggered() {
        var handler = $(document).get_on_handler('usermention_completed.zulip');

        var data = {
            mentioned: {
              email: 'foo@bar.com',
            },
        };

        $('#compose_invite_users .compose_invite_user').length = 0;

        function test_noop_case(msg_type, is_zephyr_mirror, mentioned_full_name) {
            compose_state.set_message_type(msg_type);
            page_params.realm_is_zephyr_mirror_realm = is_zephyr_mirror;
            data.mentioned.full_name = mentioned_full_name;
            handler({}, data);
            assert.equal($('#compose_invite_users').visible(), false);
        }

        test_noop_case('private', true, 'everyone');
        test_noop_case('stream', true, 'everyone');
        test_noop_case('stream', false, 'everyone');

        // Test mentioning a user that should gets a warning.

        $("#compose_invite_users").hide();
        compose_state.set_message_type('stream');
        page_params.realm_is_zephyr_mirror_realm = false;

        var checks = [
            (function () {
                var called;
                compose_fade.would_receive_message = function (email) {
                    called = true;
                    assert.equal(email, 'foo@bar.com');
                    return false;
                };
                return function () { assert(called); };
            }()),


            (function () {
                var called;
                templates.render = function (template_name, context) {
                    called = true;
                    assert.equal(template_name, 'compose-invite-users');
                    assert.equal(context.email, 'foo@bar.com');
                    assert.equal(context.name, 'Foo Barson');
                    return 'fake-compose-invite-user-template';
                };
                return function () { assert(called); };
            }()),

            (function () {
                var called;
                $("#compose_invite_users").append = function (html) {
                    called = true;
                    assert.equal(html, 'fake-compose-invite-user-template');
                };
                return function () { assert(called); };
            }()),
        ];

        data = {
            mentioned: {
              email: 'foo@bar.com',
              full_name: 'Foo Barson',
            },
        };

        handler({}, data);
        assert.equal($('#compose_invite_users').visible(), true);

        _.each(checks, function (f) { f(); });


        // Simulate that the row was added to the DOM.
        var warning_row = $('<warning row>');

        var looked_for_existing;
        warning_row.data = function (field) {
            assert.equal(field, 'useremail');
            looked_for_existing = true;
            return 'foo@bar.com';
        };

        var previous_users = $('#compose_invite_users .compose_invite_user');
        previous_users.length = 1;
        previous_users[0] = warning_row;
        $('#compose_invite_users').hide();

        // Now try to mention the same person again. The template should
        // not render.
        templates.render = noop;
        handler({}, data);
        assert.equal($('#compose_invite_users').visible(), true);
        assert(looked_for_existing);
    }());

    var event;
    var container;
    var target;
    var container_removed;
    function setup_parents_and_mock_remove(container_sel, target_sel, parent) {
        container = $.create('fake ' + container_sel);
        container_removed = false;

        container.remove = function () {
            container_removed = true;
        };

        target = $.create('fake click target (' + target_sel + ')');

        target.set_parents_result(parent, container);

        event = {
            preventDefault: noop,
            target: target,
        };
    }

    (function test_compose_all_everyone_confirm_clicked() {
        var handler = $("#compose-all-everyone")
                      .get_on_handler('click', '.compose-all-everyone-confirm');

        setup_parents_and_mock_remove('compose-all-everyone',
                                      'compose-all-everyone',
                                      '.compose-all-everyone');

        $("#compose-all-everyone").show();
        $("#compose-send-status").show();

        var compose_finish_checked = false;
        compose.finish = function () {
            compose_finish_checked = true;
        };

        handler(event);

        assert(container_removed);
        assert(compose_finish_checked);
        assert(!$("#compose-all-everyone").visible());
        assert(!$("#compose-send-status").visible());
    }());

    (function test_compose_invite_users_clicked() {
        var handler = $("#compose_invite_users")
                      .get_on_handler('click', '.compose_invite_link');
        var subscription = {
            stream_id: 102,
            name: 'test',
            subscribed: true,
        };
        var invite_user_to_stream_called = false;
        stream_edit.invite_user_to_stream = function (email, sub, success) {
            invite_user_to_stream_called = true;
            assert.equal(email, 'foo@bar.com');
            assert.equal(sub, subscription);
            success();  // This will check success callback path.
        };

        setup_parents_and_mock_remove('compose_invite_users',
                                      'compose_invite_link',
                                      '.compose_invite_user');

        // .data in zjquery is a noop by default, so handler should just return
        handler(event);

        assert(!invite_user_to_stream_called);
        assert(!container_removed);

        // !sub will result false here and we check the failure code path.
        blueslip.warn = function (err_msg) {
            assert.equal(err_msg, 'Stream no longer exists: no-stream');
        };
        $('#stream').val('no-stream');
        container.data = function (field) {
            assert.equal(field, 'useremail');
            return 'foo@bar.com';
        };
        var invite_err_sel = '.compose_invite_user_error';
        container.set_find_results(invite_err_sel, $(invite_err_sel));
        target.prop('disabled', false);
        $(invite_err_sel).hide();

        handler(event);

        assert($(invite_err_sel).visible());
        assert(target.attr('disabled'));
        assert(!invite_user_to_stream_called);
        assert(!container_removed);

        // !sub will result in true here and we check the success code path.
        stream_data.add_sub('test', subscription);
        $('#stream').val('test');
        var all_invite_children_called = false;
        $("#compose_invite_users").children = function () {
            all_invite_children_called = true;
            return [];
        };
        $("#compose_invite_users").show();

        handler(event);

        assert(container_removed);
        assert(!$("#compose_invite_users").visible());
        assert(invite_user_to_stream_called);
        assert(all_invite_children_called);
    }());

    (function test_compose_invite_close_clicked() {
        var handler = $("#compose_invite_users")
                        .get_on_handler('click', '.compose_invite_close');

        setup_parents_and_mock_remove('compose_invite_users_close',
                                      'compose_invite_close',
                                      '.compose_invite_user');

        var all_invite_children_called = false;
        $("#compose_invite_users").children = function () {
            all_invite_children_called = true;
            return [];
        };
        $("#compose_invite_users").show();

        handler(event);

        assert(container_removed);
        assert(all_invite_children_called);
        assert(!$("#compose_invite_users").visible());
    }());

    event = {
        preventDefault: noop,
    };

    (function test_stream_name_completed_triggered() {
        var handler = $(document).get_on_handler('streamname_completed.zulip');

        var data = {
            stream: {
                name: 'Denmark',
            },
        };

        function test_noop_case(invite_only) {
            compose_state.set_message_type('stream');
            data.stream.invite_only = invite_only;
            handler({}, data);
            assert.equal($('#compose_private_stream_alert').visible(), false);
        }

        test_noop_case(false);

        $("#compose_private").hide();
        compose_state.set_message_type('stream');

        var checks = [
           (function () {
               var called;
               templates.render = function (template_name, context) {
                   called = true;
                   assert.equal(template_name, 'compose_private_stream_alert');
                   assert.equal(context.stream_name, 'Denmark');
                   return 'fake-compose_private_stream_alert-template';
               };
               return function () { assert(called); };
           }()),

           (function () {
              var called;
              $("#compose_private_stream_alert").append = function (html) {
                  called = true;
                  assert.equal(html, 'fake-compose_private_stream_alert-template');
              };
              return function () { assert(called); };
           }()),
        ];

        data = {
           stream: {
               invite_only: true,
               name: 'Denmark',
           },
        };

        handler({}, data);
        assert.equal($('#compose_private_stream_alert').visible(), true);

        _.each(checks, function (f) { f(); });

    }());

    (function test_attach_files_compose_clicked() {
        var handler = $("#compose")
                        .get_on_handler("click", "#attach_files");
        $('#file_input').clone = function (param) {
            assert(param);
        };
        var compose_file_input_clicked = false;
        $('#compose #file_input').trigger = function (ev_name) {
            assert.equal(ev_name, 'click');
            compose_file_input_clicked = true;
        };
        handler(event);
        assert(compose_file_input_clicked);
    }());

    (function test_video_link_compose_clicked() {
        var syntax_to_insert;

        compose_ui.insert_syntax_and_focus = function (syntax) {
            syntax_to_insert = syntax;
        };

        var handler = $("#compose").get_on_handler("click", "#video_link");
        $('#compose-textarea').val('');

        handler(event);

        // video link ids consist of 15 random digits
        var video_link_regex = /\[Click to join video call\]\(https:\/\/meet.jit.si\/\d{15}\)/;
        assert(video_link_regex.test(syntax_to_insert));
    }());

    (function test_markdown_preview_compose_clicked() {
        // Tests setup
        function setup_visibilities() {
            $("#compose-textarea").show();
            $("#markdown_preview").show();
            $("#undo_markdown_preview").hide();
            $("#preview_message_area").hide();
        }

        function assert_visibilities() {
            assert(!$("#compose-textarea").visible());
            assert(!$("#markdown_preview").visible());
            assert($("#undo_markdown_preview").visible());
            assert($("#preview_message_area").visible());
        }

        function setup_mock_markdown_contains_backend_only_syntax(msg_content, return_val) {
            markdown.contains_backend_only_syntax = function (msg) {
                assert.equal(msg, msg_content);
                return return_val;
            };
        }

        function test_post_success(success_callback) {
            var resp = {
                rendered: 'Server: foobarfoobar',
            };
            success_callback(resp);
            assert.equal($("#preview_content").html(), 'Server: foobarfoobar');
        }

        function test_post_error(error_callback) {
            error_callback();
            assert.equal($("#preview_content").html(),
                            'translated: Failed to generate preview');
        }

        function mock_channel_post(msg) {
            channel.post = function (payload) {
                assert.equal(payload.url, '/json/messages/render');
                assert(payload.idempotent);
                assert(payload.data);
                assert.deepEqual(payload.data.content, msg);

                function test(func, param) {
                    var destroy_indicator_called = false;
                    loading.destroy_indicator = function (spinner) {
                        assert.equal(spinner, $("#markdown_preview_spinner"));
                        destroy_indicator_called = true;
                    };
                    setup_mock_markdown_contains_backend_only_syntax(msg, true);

                    func(param);

                    assert(destroy_indicator_called);
                }

                test(test_post_error, payload.error);
                test(test_post_success, payload.success);

            };
        }

        var handler = $("#compose")
                        .get_on_handler("click", "#markdown_preview");

        // Tests start here
        $("#compose-textarea").val('');
        setup_visibilities();

        handler(event);

        assert.equal($("#preview_content").html(),
                      'translated: Nothing to preview');
        assert_visibilities();

        var make_indicator_called = false;
        $("#compose-textarea").val('```foobarfoobar```');
        setup_visibilities();
        setup_mock_markdown_contains_backend_only_syntax('```foobarfoobar```', true);
        loading.make_indicator = function (spinner) {
            assert.equal(spinner, $("#markdown_preview_spinner"));
            make_indicator_called = true;
        };
        mock_channel_post('```foobarfoobar```');

        handler(event);

        assert(make_indicator_called);
        assert_visibilities();

        var apply_markdown_called = false;
        $("#compose-textarea").val('foobarfoobar');
        setup_visibilities();
        setup_mock_markdown_contains_backend_only_syntax('foobarfoobar', false);
        mock_channel_post('foobarfoobar');
        markdown.apply_markdown = function (msg) {
            assert.equal(msg.raw_content, 'foobarfoobar');
            apply_markdown_called = true;
            return msg;
        };

        handler(event);

        assert(apply_markdown_called);
        assert_visibilities();
        assert.equal($("#preview_content").html(),
                      'Server: foobarfoobar');
    }());

    (function test_undo_markdown_preview_clicked() {
        var handler = $("#compose")
                        .get_on_handler("click", "#undo_markdown_preview");

        $("#compose-textarea").hide();
        $("#undo_markdown_preview").show();
        $("#preview_message_area").show();
        $("#markdown_preview").hide();

        handler(event);

        assert($("#compose-textarea").visible());
        assert(!$("#undo_markdown_preview").visible());
        assert(!$("#preview_message_area").visible());
        assert($("#markdown_preview").visible());
    }());

}());

(function test_set_focused_recipient() {
    var sub = {
        stream_id: 101,
        name: 'social',
        subscribed: true,
    };
    stream_data.add_sub('social', sub);

    var page = {
        '#stream': 'social',
        '#subject': 'lunch',
        '#compose-textarea': 'burrito',
        '#private_message_recipient': 'alice@example.com,    bob@example.com',
    };

    global.$ = function (selector) {
        return {
            val: function () {
                return page[selector];
            },
        };
    };

    global.compose_state.get_message_type = function () {
        return 'stream';
    };

    global.$.trim = function (s) {
        return s;
    };


    var message = compose.create_message_object();
    assert.equal(message.to, 'social');
    assert.equal(message.subject, 'lunch');
    assert.equal(message.content, 'burrito');

    global.compose_state.get_message_type = function () {
        return 'private';
    };
    message = compose.create_message_object();
    assert.deepEqual(message.to, ['alice@example.com', 'bob@example.com']);
    assert.equal(message.to_user_ids, '31,32');
    assert.equal(message.content, 'burrito');

}());
