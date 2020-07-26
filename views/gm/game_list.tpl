%include("header", title="Games List")

<h1>Games Overview</h1>

<table>
	</tr>
%for g in games.order_by(lambda s: s.id):
	<tr>
		<td>{{g.title}}</td>
		<td><a href="/setup/list/{{g.title}}">Setup</a></td>
		%if g.active != '':
			<td><a href="/gm/{{g.title}}" target="_blank">Play as GM</a></td>
			<td><a href="/play/{{g.title}}" target="_blank">Player-Link</a></td>
		%else:
			<td></td>
			<td></td>
		%end
	</tr>
%end
</table>

<form action="/setup/create/" id="create_game" method="post">
	Game title: <input type="text" name="game_title" value="untitled" /><input type="submit" value="Create" />
</form>

%include("footer")

