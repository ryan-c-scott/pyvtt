
// --- image handling implementation ------------------------------------------

var images = [];

function clearCanvas() {
	var canvas = $('#battlemap');
	var context = canvas[0].getContext("2d");
	context.clearRect(0, 0, canvas[0].width, canvas[0].height);
}

// --- token implementation ---------------------------------------------------

var tokens = [];

function Token(token_id, url) {
	this.token_id = token_id;
	this.x = 0;
	this.y = 0;
	this.size = 250;
	this.url = url;
	this.rotate = 0.0;
	this.flip_x = false;
	this.flip_y = false;
	this.locked = false;
}

function addToken(token_id, url) {
	tokens[token_id] = new Token(token_id, url);
}

function selectToken(x, y) {
	var result = null;
	// search for any fitting (unlocked) token
	$.each(tokens, function(index, item) {
		if (item != null && !item.locked) {
			var min_x = item.x - item.size / 2;
			var max_x = item.x + item.size / 2;
			var min_y = item.y - item.size / 2;
			var max_y = item.y + item.size / 2;
			if (min_x <= x && x <= max_x && min_y <= y && y <= max_y) {
				result = item;
			}
		}
	});
	if (result == null) {
		// search for any fitting (locked) token
		$.each(tokens, function(index, item) {
			if (item != null && item.locked) {
				var min_x = item.x - item.size / 2;
				var max_x = item.x + item.size / 2;
				var min_y = item.y - item.size / 2;
				var max_y = item.y + item.size / 2;
				if (min_x <= x && x <= max_x && min_y <= y && y <= max_y) {
					result = item;
				}
			}
		});
	}
	return result;
}

function updateToken(data) {
	// create token if necessary
	if (!tokens.includes(data.token_id)) {
		addToken(data.token_id, data.remote_path);
	}
	
	// update token data
	tokens[data.token_id].x      = data.pos[0];
	tokens[data.token_id].y      = data.pos[1];
	tokens[data.token_id].size   = data.size;
	tokens[data.token_id].rotate = data.rotate;
	tokens[data.token_id].flip_x = data.flip_x;
	tokens[data.token_id].flip_y = data.flip_y;
	tokens[data.token_id].locked = data.locked;
}

function drawToken(token, show_ui) {
	// cache image if necessary
	if (!images.includes(token.url)) {
		images[token.url] = new Image();
		images[token.url].src = token.url;
	}
	
	// calculate new height (keeping aspect ratio)
	var ratio  = images[token.url].height / images[token.url].width;
	var w = token.size;
	var h = w * ratio;
	
	// draw image
	var canvas = $('#battlemap');
	var context = canvas[0].getContext("2d");
	context.save();
	context.translate(token.x, token.y);
	if (show_ui) {
		context.beginPath();
		context.moveTo(-w/2, -h/2);
		context.lineTo(w/2, -h/2);
		context.lineTo(w/2, h/2);
		context.lineTo(-w/2, h/2);
		context.lineTo(-w/2, -h/2);
		context.stroke();
	}
	context.rotate(token.rotate * 3.14/180.0);
	context.drawImage(images[token.url], -w / 2, -h / 2, w, h);
	context.restore();
}

// --- game state implementation ----------------------------------------------

var game_title = '';

var mouse_x = 0;
var mouse_y = 0;

var select_id = 0;
var dragging = false;

var pull_tick = 0;
var drag_preview_idle = 0;

function handleSelectedToken(token) {
	if (dragging && !token.locked) {
		if (drag_preview_idle > 4) {
			// client side prediction
			token.x = mouse_x;
			token.y = mouse_y;
		} else {
			drag_preview_idle += 1;
		}
	}
	drawToken(token, true);
}

function update() {
	if (pull_tick > 10) {
		url = '/ajax/' + game_title + '/update';
		$.getJSON(url, function(data) {
			tokens = [];
			$.each(data, function(index, item) {
				updateToken(item);
			});
			
			pull_tick = 0;
		});
	}
	pull_tick += 1;
	
	clearCanvas();
	// draw locked tokens
	$.each(tokens, function(index, item) {
		if (item != null && item.locked) {
			if (item.token_id == select_id) {
				// draw token with ui
				handleSelectedToken(item);
			} else {
				drawToken(item, false);
			}
		}
	});
	// draw unlocked tokens
	$.each(tokens, function(index, item) {
		if (item != null && !item.locked) {
			if (item.token_id == select_id) {
				// draw token with ui
				handleSelectedToken(item);
			} else {
				drawToken(item, false);
			}
		}
	});
	
	setTimeout("update()", 15);
}

function start(title) {
	game_title = title;
	
	update();
}

function tokenMove() {
	mouse_x = event.offsetX;
	mouse_y = event.offsetY;
	
	if (select_id != 0) {
		var token = tokens[select_id];
		$('#info')[0].innerHTML = 'Token#' + select_id + ' at (' + token.x + '|' + token.y + ')';
	}
}

function tokenClick() {
	mouse_x = event.offsetX;
	mouse_y = event.offsetY;
	drag_preview_idle = 0;
	
	select_id = 0;
	var token = selectToken(mouse_x, mouse_y);
	if (token != null) {
		select_id = token.token_id;
		dragging = true;
		
		$('#info')[0].innerHTML = 'Token#' + select_id + ' at (' + token.x + '|' + token.y + ')';
		$('#locked')[0].checked = token.locked;
	}
}

function tokenRelease() {
	if (select_id != 0) {
		url = '/ajax/' + game_title + '/move/' + select_id + '/' + mouse_x + '/' + mouse_y;
		$.post(url);
		
		dragging = false
	}
}

function tokenWheel(event) {
	if (select_id != 0) {
		var token = tokens[select_id];
		if (token.locked) {
			return;
		}
		
		if (event.shiftKey) {
			token.rotate = token.rotate - 2 * event.deltaY;
			if (token.rotate >= 360.0 || token.rotate <= -360.0) {
				token.rotate = 0.0;
			}
			var url = '/ajax/' + game_title + '/rotate/' + select_id + '/' + token.rotate;
			$.post(url);
			
		} else {
			token.size += -2 * event.deltaY;
			if (token.size > 1440) {
				token.size = 1440;
			}
			if (token.size < 16) {
				token.size = 16;
			}
			var url = '/ajax/' + game_title + '/resize/' + select_id + '/' + token.size;
			$.post(url);
		}
	}
}

function tokenLock() {
	if (select_id != 0) {
		var lock_it = $('#locked')[0].checked;
		var url = '/ajax/' + game_title + '/lock/' + select_id + '/';
		if (lock_it) {
			url += '1';
		} else {
			url += '0';
		}
		$.post(url);
		
		tokens[select_id].lock = lock_it;
	}
}

function tokenClone() {
	var url = '/ajax/' + game_title + '/clone/' + select_id;
	$.post(url);
}

function tokenDelete(event) {
	var url = '/ajax/' + game_title + '/delete/' + select_id;
	$.post(url);
}


