prompt ==========================================
prompt ORDS - POST simples de palpites
prompt Payload:
prompt {
prompt   "id_usuario": 3,
prompt   "id_jogo": "BRA-MAR-01",
prompt   "gols_casa": 2,
prompt   "gols_fora": 1
prompt }
prompt ==========================================

declare
  l_body        json_object_t;
  l_id_usuario  number;
  l_id_jogo     varchar2(80);
  l_grupo_jogo  varchar2(20);
  l_time_casa   varchar2(120);
  l_time_fora   varchar2(120);
  l_gols_casa   number;
  l_gols_fora   number;

  procedure send_json(p_status number, p_json clob) is
  begin
    :status_code := p_status;
    owa_util.mime_header('application/json', false);
    htp.p('Cache-Control: no-store');
    owa_util.http_header_close;
    htp.prn(p_json);
  end;
begin
  l_body := json_object_t.parse(:body_text);

  l_id_usuario := l_body.get_number('id_usuario');
  l_id_jogo := trim(l_body.get_string('id_jogo'));
  l_grupo_jogo := trim(l_body.get_string('grupo_jogo'));
  l_time_casa := trim(l_body.get_string('time_casa'));
  l_time_fora := trim(l_body.get_string('time_fora'));
  l_gols_casa := l_body.get_number('gols_casa');
  l_gols_fora := l_body.get_number('gols_fora');

  if l_id_usuario is null then
    send_json(400, '{"success":false,"error":"id_usuario obrigatorio."}');
    return;
  end if;

  if l_id_jogo is null then
    send_json(400, '{"success":false,"error":"id_jogo obrigatorio."}');
    return;
  end if;

  if l_time_casa is null or l_time_fora is null then
    send_json(400, '{"success":false,"error":"time_casa e time_fora sao obrigatorios."}');
    return;
  end if;

  if l_gols_casa is null or l_gols_fora is null then
    send_json(400, '{"success":false,"error":"gols_casa e gols_fora sao obrigatorios."}');
    return;
  end if;

  merge into admin.palpites_bolao destino
  using (
    select
      l_id_usuario as id_usuario,
      l_id_jogo as id_jogo,
      l_grupo_jogo as grupo_jogo,
      l_time_casa as time_casa,
      l_time_fora as time_fora,
      l_gols_casa as gols_casa,
      l_gols_fora as gols_fora
    from dual
  ) origem
  on (
    destino.id_usuario = origem.id_usuario
    and destino.id_jogo = origem.id_jogo
  )
  when matched then
    update set
      destino.grupo_jogo = origem.grupo_jogo,
      destino.time_casa = origem.time_casa,
      destino.time_fora = origem.time_fora,
      destino.gols_casa = origem.gols_casa,
      destino.gols_fora = origem.gols_fora,
      destino.data_palpite = current_timestamp
  when not matched then
    insert (
      id_palpite,
      id_usuario,
      id_jogo,
      grupo_jogo,
      time_casa,
      time_fora,
      gols_casa,
      gols_fora,
      data_palpite
    )
    values (
      admin.seq_palpites_bolao.nextval,
      origem.id_usuario,
      origem.id_jogo,
      origem.grupo_jogo,
      origem.time_casa,
      origem.time_fora,
      origem.gols_casa,
      origem.gols_fora,
      current_timestamp
    );

  commit;

  send_json(
    200,
    json_object(
      'success' value true,
      'message' value 'Palpite salvo com sucesso.',
      'data' value json_object(
        'id_usuario' value l_id_usuario,
        'id_jogo' value l_id_jogo,
        'grupo_jogo' value l_grupo_jogo,
        'time_casa' value l_time_casa,
        'time_fora' value l_time_fora,
        'gols_casa' value l_gols_casa,
        'gols_fora' value l_gols_fora
      )
    returning clob)
  );
exception
  when others then
    rollback;
    send_json(
      500,
      json_object(
        'success' value false,
        'error' value 'Erro ao salvar palpite.',
        'details' value sqlerrm
      returning clob)
    );
end;
/
