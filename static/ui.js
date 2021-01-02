/** Powered by PyVTT. Further information: https://github.com/cgloeckner/pyvtt **/
  
var mouse_x = 0; // relative to canvas
var mouse_y = 0;

var copy_tokens   = [];    // determines copy-selected token (CTRL+C)
var select_ids    = [];    // contains selected tokens' ids
var primary_id    = 0;     // used to specify "leader" in group (for relative movement)
var mouse_over_id = 0;     // determines which token would be selected
var grabbed       = false; // determines whether grabbed or not

var select_from_x = null;
var select_from_y = null;

// --- token implementation -------------------------------------------

/// Determiens if position is within token's bounding box
function isOverToken(x, y, token) {
	var canvas   = $('#battlemap');
	var size     = getActualSize(token, canvas[0].width, canvas[0].height);
	var max_size = Math.max(size[0], size[1]); // because the token might be rotated
	
	// 1st stage: bounding box test
	if (token.size > 0) {
		var min_x = token.posx - max_size / 2;
		var max_x = token.posx + max_size / 2;
		var min_y = token.posy - max_size / 2;
		var max_y = token.posy + max_size / 2;
		var in_box = min_x <= x && x <= max_x && min_y <= y && y <= max_y;
		if (!in_box) {
			return false;
		}
	}
	
	// 2nd stage: image alpha test
	// note: query at position relative to token's center
	var dx = x - token.posx;
	var dy = y - token.posy;
	var pixel_data = getPixelData(token, dx, dy);
	return pixel_data[3] > 0; 
}

/// Determines which token is selected when clicking the given position
function selectToken(x, y) {
	var result = null;
	var bestz = min_z - 1;
	// search for any fitting culling with highest z-order (unlocked first)
	$.each(culling, function(index, item) {
		if (item != null && !item.locked && item.zorder > bestz && isOverToken(x, y, item)) {
			bestz  = item.zorder;
			result = item;
		}
	});
	if (result == null) {
		// try locked tokens next
		$.each(culling, function(index, item) {
			if (item != null && item.locked && item.zorder > bestz && isOverToken(x, y, item)) {
				bestz  = item.zorder;
				result = item;
			}
		});
	}
	return result;
}

// --- player implementation ------------------------------------------

var players = {};

function getCookie(key) {
	var arr = document.cookie.split(key + '=')[1];
	if (arr == null) {
		return '';
	}
	return arr.split('; ')[0];
}

function setCookie(key, value) {
	// magical cookie properties :)
	// this REALLY appends / updates based on the current cookie
	document.cookie = key + '=' + value;
}

function showPlayer(name, uuid, color, country) {
	if (name in players) {
		hidePlayer(name, uuid);
	}
	var flag = '';
	if (country != '?') {
		flag = '<img src="https://www.countryflags.io/' + country + '/flat/16.png" />';
	}
	
	$('#players').append('<span id="player_' + uuid + '" class="player" style="filter: drop-shadow(1px 1px 9px ' + color + ') drop-shadow(-1px -1px 0 ' + color + ');">' + flag + name + '</span>');
	players[name] = color;
}

function hidePlayer(name, uuid) {
	if (name in players) {
		$('#player_' + uuid).remove();
		delete players[name];
	}
}

// --- dice rolls implementation --------------------------------------

var rolls        = []; // current rolls
var roll_timeout = 20000.0; // ms until roll will disappear

/// Roll constructor
function Roll(sides, playername, result) {
	this.sides      = sides;
	this.playername = player;
	this.result     = result;
}

function addRoll(sides, result, color) {
	// create dice result
	var container = $('#d' + sides + 'box');
	css = 'filter: drop-shadow(1px 1px 5px ' + color + ') drop-shadow(-1px -1px 0 ' + color + ');';
	var span = '<span style="' + css + '">' + result + '</span>';
	container.prepend(span);
	
	// prepare automatic cleanup
	var dom_span = container.children(':first-child')
	if (result == 1 || result == sides) {
		dom_span.addClass('natroll');
	}
	dom_span.delay(roll_timeout).fadeOut(5000, function() { this.remove(); });
}

// --- ui event handles -----------------------------------------------

function mouseDrag(event) {
	event.preventDefault();
	pickCanvasPos(event);
	
	if (primary_id != 0) {
		var first_token = tokens[primary_id] 
		
		if (drag_action == 'resize') {
			// calculate distance between mouse and token   
			var dx = first_token.posx - mouse_x;
			var dy = first_token.posy - mouse_y;
			var scale = Math.sqrt(dx*dx + dy*dy);
			var radius = first_token.size * 0.8;
			
			// normalize distance using distance mouse/icon
			ratio = scale / radius;
			
			// resize all selected tokens
			var changes = []
			$.each(select_ids, function(index, id) {
				var token = tokens[id];
				if (token.locked) {
					return;
				}
				
				var size = Math.round(token.size * ratio);
				
				if (size > min_token_size * 10) {
					size = min_token_size * 10;
				}
				if (size < min_token_size) {
					size = min_token_size;
				}
				
				changes.push({
					'id'   : id,
					'size' : size
				});
			});
			
			writeSocket({
				'OPID'    : 'UPDATE',
				'changes' : changes
			})
			
		} else if (drag_action == 'rotate') {
			// calculate vectors between origin/icon and origni/mouse
			// note: assuming the rotation icon is at top
			var icon_box = $('#tokenRotate')[0].getBoundingClientRect();
			var canvas_box = $('#battlemap')[0].getBoundingClientRect();
			icon_dx  = 0
			icon_dy  = -first_token.size * 0.8;
			mouse_dx = mouse_x - first_token.posx;
			mouse_dy = mouse_y - first_token.posy;
			
			// calculate rotation angle
			dotp       = icon_dx * mouse_dx + icon_dy * mouse_dy;
			norm_icon  = first_token.size * 0.8;
			norm_mouse = Math.sqrt(mouse_dx * mouse_dx + mouse_dy * mouse_dy);
			radians    = Math.acos(dotp / (norm_icon * norm_mouse));
			angle      = radians * 180 / 3.14;
			
			if (mouse_dx < 0) {
				angle *= -1;
			}
			
			// rotate all selected tokens
			var changes = []
			$.each(select_ids, function(index, id) {
				var token = tokens[id];
				if (token.locked) {
					return;
				}
				
				var rotate = angle;
				changes.push({
					'id'     : id,
					'rotate' : rotate
				});
			});
			
			writeSocket({
				'OPID'    : 'UPDATE',
				'changes' : changes
			})
		}
	}
	
	updateTokenbar();
}

function uploadDrop(event) {
	event.preventDefault();
	pickCanvasPos(event);
	
	var queue = $('#uploadqueue')[0];
	queue.files = event.dataTransfer.files;
	
	var f = new FormData($('#uploadform')[0]);
	
	$.ajax({
		url: '/' + gm_name + '/' + game_url + '/upload/' + mouse_x + '/' + mouse_y,
		type: 'POST',
		data: f,
		contentType: false,
		cache: false,
		processData: false,
		success: function(response) {
			// reset uploadqueue
			$('#uploadqueue').val("");
		}
	});
}

function showTokenbar(token_id) {
	if (select_ids.includes(token_id)) {
		$('#tokenbar').css('visibility', 'visible');
	} else {
		$('#tokenbar').css('visibility', 'hidden');
	}
}

var token_icons = ['Rotate', 'Top', 'Bottom', 'Resize', 'FlipX', 'Lock'];

function updateTokenbar() {
	$('#tokenbar').css('visibility', 'hidden');

	if (primary_id && !grabbed) {
		token = tokens[primary_id];
		
		if (token == null) {
			return;
		}
		
		// cache image if necessary
		if (!images.includes(token.url)) {
			images[token.url] = new Image();
			images[token.url].src = token.url;
		}
		
		// image size aspect ratio
		var src_h = images[token.url].height;
		var src_w = images[token.url].width;
		var ratio = src_w / src_h;
			
		// determine token size
		var canvas = $('#battlemap');
		var size = token.size;
		if (size == -1) {
			size = canvas[0].height;
		}
		
		// position tokenbar centered to token
		var bx = canvas[0].getBoundingClientRect();
		
		$('#tokenbar').css('left', bx.left + 'px');
		$('#tokenbar').css('top',  bx.top  + 'px');
		$('#tokenbar').css('visibility', '');
		
		$.each(token_icons, function(index, name) {
			// calculate position based on angle
			var degree = 360.0 / token_icons.length;
			var s = Math.sin((-90.0 + index * degree) * 3.14 / 180);
			var c = Math.cos((-90.0 + index * degree) * 3.14 / 180);
			
			var x = size * c * 0.8 + token.posx * canvas_scale - 12;
			var y = size * s * 0.8 + token.posy * canvas_scale - 12;
			
			// force position to be on the screen
			x = Math.max(0, Math.min(canvas.width(), x));
			y = Math.max(0, Math.min(canvas.height(), y));
			
			// place icon
			$('#token' + name).css('left', x + 'px');
			$('#token' + name).css('top',  y + 'px');
		});
		
		// handle locked mode
		if (token.locked) {
			$('#tokenFlipX').css('visibility', 'hidden');
			$('#tokenLock')[0].src = '/static/locked.png';
			$('#tokenTop').css('visibility', 'hidden');
			$('#tokenBottom').css('visibility', 'hidden');
			$('#tokenResize').css('visibility', 'hidden');
			$('#tokenRotate').css('visibility', 'hidden');
		} else {
			$('#tokenFlipX').css('visibility', '');
			$('#tokenLock')[0].src = '/static/unlocked.png';
			$('#tokenTop').css('visibility', '');
			$('#tokenBottom').css('visibility', '');
			$('#tokenResize').css('visibility', '');    
			$('#tokenRotate').css('visibility', '');
		}
	}
}

// ----------------------------------------------------------------------------

var drag_action = ''; // used to identify dragging for resize or rotate

/// Select mouse/touch position relative to the canvas
function pickCanvasPos(event) {
	if (event.changedTouches) {
		var touchobj = event.changedTouches[0];
		mouse_x = touchobj.clientX;
		mouse_y = touchobj.clientY;
	} else {
		mouse_x = event.clientX;
		mouse_y = event.clientY;
	}
	
	// make pos relative
	var bx = $('#battlemap')[0].getBoundingClientRect();
	mouse_x -= bx.left;
	mouse_y -= bx.top;
	
	mouse_x = parseInt(mouse_x / canvas_scale);
	mouse_y = parseInt(mouse_y / canvas_scale);
}

/// Event handle for start grabbing a token
function tokenGrab(event) {
	closeDropdown();
	
	pickCanvasPos(event);
	
	if (event.buttons == 1) {
		// Left Click: select token
		var token = selectToken(mouse_x, mouse_y);
		
		if (token != null) {
			var before = select_ids;
			
			// reselect only if token wasn't selected before
			if (!select_ids.includes(token.id)) {
				select_ids = [token.id];
				primary_id = token.id;
				
			} else {
				primary_id = token.id;
			}
			grabbed = true;
			
			if (before != select_ids) {
				// notify server about selection
				writeSocket({
					'OPID'     : 'SELECT',
					'selected' : select_ids
				});
			}
			
		} else {
			// Clear selection
			select_ids = [];
			primary_id = 0;
			
			// start selection box
			select_from_x = mouse_x;
			select_from_y = mouse_y;
		}
		
	} else if (event.buttons == 2) {
		// Right click: reset token scale & rotation
		var changes = [];
		$.each(select_ids, function(index, id) {
			var token = tokens[id];
			
			if (token.locked) {
				// ignore if locked
				return;
			}
			
			token.rotate = 0;
			token.size   = Math.round(min_token_size * 1.5);
			
			changes.push({
				'id'     : id,
				'size'   : token.size,
				'rotate' : token.rotate
			});
		});
		
		writeSocket({
			'OPID'    : 'UPDATE',
			'changes' : changes
		});
	}
}

/// Event handle for releasing a grabbed token
function tokenRelease() {
	if (select_ids.length > 0) {
		grabbed = false;
	}
	
	$('#battlemap').css('cursor', 'default');
	
	if (select_from_x != null) {
		// finish selection box
		var select_width  = mouse_x - select_from_x;
		var select_height = mouse_y - select_from_y;
		
		// handle box created to the left
		if (select_width < 0) {
			select_from_x = select_from_x + select_width;
			select_width *= -1;
		}
			 
		// handle box created to the top
		if (select_height < 0) {
			select_from_y = select_from_y + select_height;
			select_height *= -1;
		}
		
		primary_id = 0;
		
		writeSocket({
			'OPID'   : 'RANGE',
			'left'   : select_from_x,
			'top'    : select_from_y,
			'width'  : select_width,
			'height' : select_height
		});
	}
	
	select_from_x = null;
	select_from_y = null;
	
	updateTokenbar();
}

/// Event handle for moving a grabbed token (if not locked)
function tokenMove(event) {
	pickCanvasPos(event);
	
	if (primary_id != 0 && grabbed) {
		var token = tokens[primary_id];
		 
		// transform cursor
		if (token == null) {
			$('#battlemap').css('cursor', 'default');
		} else if (token.locked) {
			$('#battlemap').css('cursor', 'not-allowed');
		} else {                                         
			$('#battlemap').css('cursor', 'grab');
		}
		
		if (token != null && !token.locked) {
			var prev_posx = token.posx;
			var prev_posy = token.posy;
			
			var changes = []
			$.each(select_ids, function(index, id) {
				var t = tokens[id];
				if (!t.locked) {
					// get position relative to primary token
					var dx = t.posx - prev_posx;
					var dy = t.posy - prev_posy;
					// move relative to primary token
					t.posx = mouse_x + dx;
					t.posy = mouse_y + dy;
					
					changes.push({
						'id'   : id,
						'posx' : t.posx,
						'posy' : t.posy
					});
				}
			});
			
			writeSocket({
				'OPID'    : 'UPDATE',
				'changes' : changes
			})
		}
	} else {
		var token = selectToken(mouse_x, mouse_y);
		 
		// transform cursor
		if (token == null) {
			$('#battlemap').css('cursor', 'default');
		} else if (token.locked) {
			$('#battlemap').css('cursor', 'not-allowed');
		} else {                                         
			$('#battlemap').css('cursor', 'grab');
		}
	}
	
	updateTokenbar();
}

/// Event handle for rotation via mouse wheel
function tokenWheel(event) {
	var changes = [];
	$.each(select_ids, function(index, id) {
		var token = tokens[id];
		if (token.locked) {
			return;
		}

		// handle rotation
		token.rotate = token.rotate - 5 * event.deltaY;
		if (token.rotate >= 360.0 || token.rotate <= -360.0) {
			token.rotate = 0.0;
		}
		
		changes.push({
			'id'     : id,
			'rotate' : token.rotate
		});
	});
	
	writeSocket({
		'OPID'    : 'UPDATE',
		'changes' : changes
	});
	
	updateTokenbar();
}

/// Event handle to click a dice
function rollDice(sides) {
	$('#d' + sides).addClass('shake');
	
	writeSocket({
		'OPID'  : 'ROLL',
		'sides' : sides
	});
	
	setTimeout(function() {	$('#d' + sides).removeClass('shake'); }, 500);
}

/// Event handle to select all tokens
function selectAllTokens() {
	event.preventDefault();
	
	select_ids = [];
	$.each(tokens, function(index, token) {
		if (token != null && token.size != -1) {
			select_ids.push(token.id);
		}
	});
}

/// Event handle to copy selected tokens
function copySelectedTokens() { 
	event.preventDefault();
	
	copy_tokens = select_ids;
}

/// Event handle to paste copied tokens
function pasteCopiedTokens() {
	event.preventDefault();
	
	if (copy_tokens.length > 0) {
		writeSocket({
			'OPID' : 'CLONE',
			'ids'  : copy_tokens,
			'posx' : mouse_x,
			'posy' : mouse_y
		});
	}
}

/// Event handle to delete selected tokens
function deleteSelectedTokens() { 
	event.preventDefault();
	
	if (select_ids.length > 0) {
		writeSocket({
			'OPID'   : 'DELETE',
			'tokens' : select_ids
		});
	}
}

/// Event handle shortcuts on (first) selected token
function tokenShortcut(event) {
	if (event.ctrlKey) {
		if (event.keyCode == 65) { // CTRL+A
			selectAllTokens();
			
		} else if (event.keyCode == 67) { // CTRL+C
			copySelectedTokens();
			
		} else if (event.keyCode == 86) { // CTRL+V
			pasteCopiedTokens();
		}
	} else {
		if (event.keyCode == 46) { // DEL
			deleteSelectedTokens();
		}
	}
}

/// Event handle for fliping a token x-wise
function tokenFlipX() {
	var changes = [];
	$.each(select_ids, function(index, id) {
		var token = tokens[id];
		
		if (token.locked) {
			// ignore if locked
			return; 
		}
		token.flipx = !token.flipx;
		
		changes.push({
			'id'    : id,
			'flipx' : token.flipx
		});
	});
	
	writeSocket({
		'OPID'    : 'UPDATE',
		'changes' : changes
	});
}

/// Event handle for (un)locking a token
function tokenLock() {
	// determine primary lock state
	var primary_lock = false;
	if (primary_id > 0) {
		primary_lock = tokens[primary_id].locked
	}
	
	var changes = [];
	$.each(select_ids, function(index, id) {
		var token = tokens[id];
		token.locked = !primary_lock;
		
		changes.push({
			'id'     : id,
			'locked' : token.locked
		});
	});
	
	writeSocket({
		'OPID'    : 'UPDATE',
		'changes' : changes
	});
}

/// Event handle for resize a token
function tokenResize() {
	drag_action = 'resize';
}

/// Event handle for rotating a token
function tokenRotate() {
	drag_action = 'rotate'; 
}

/// Event handle for quitting rotation/resize dragging
function tokenQuitAction() {
	drag_action = '';    
}

/// Event handle for moving token to lowest z-order
function tokenBottom() {
	var changes = [];
	$.each(select_ids, function(index, id) {
		var token = tokens[id];
		
		if (token.locked) {
			// ignore if locked
			return;
		}
		// move beneath lowest known z-order
		if (token.locked) {
			token.zorder = 1;
		} else {
			token.zorder = min_z - 1;
			--min_z;
		}
		
		changes.push({
			'id'     : id,
			'zorder' : token.zorder
		});
	});
	
	writeSocket({
		'OPID'    : 'UPDATE',
		'changes' : changes
	});
}

/// Event handle for moving token to hightest z-order
function tokenTop() { 
	var changes = [];
	$.each(select_ids, function(index, id) {
		var token = tokens[id];
		
		if (token.locked) {
			// ignore if locked
			return;
		}
		// move above highest known z-order
		if (token.locked) {
			token.zorder = -1;
		} else {
			token.zorder = max_z - 1;
			++max_z;
		}
		
		changes.push({
			'id'     : id,
			'zorder' : token.zorder
		});
	});
	
	writeSocket({
		'OPID'    : 'UPDATE',
		'changes' : changes
	});
}
