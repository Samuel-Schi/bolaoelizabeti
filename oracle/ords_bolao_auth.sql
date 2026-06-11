prompt ==========================================
prompt ORDS - API de Login e Cadastro do Bolao
prompt ==========================================

begin
  execute immediate q'[
    create sequence ADMIN.SEQ_USUARIOS_BOLAO
      start with 1
      increment by 1
      nocache
  ]';
exception
  when others then
    if sqlcode != -955 then
      raise;
    end if;
end;
/

begin
  ords.enable_schema(
    p_enabled             => true,
    p_schema              => 'ADMIN',
    p_url_mapping_type    => 'BASE_PATH',
    p_url_mapping_pattern => 'admin',
    p_auto_rest_auth      => false
  );
  commit;
end;
/

begin
  ords.delete_module(
    p_module_name => 'bolao_auth'
  );
  commit;
exception
  when others then
    null;
end;
/

begin
  ords.define_module(
    p_module_name    => 'bolao_auth',
    p_base_path      => 'bolao-dosasah/',
    p_items_per_page => 25,
    p_status         => 'PUBLISHED'
  );

  ords.define_template(
    p_module_name => 'bolao_auth',
    p_pattern     => 'register'
  );

  ords.define_handler(
    p_module_name => 'bolao_auth',
    p_pattern     => 'register',
    p_method      => 'POST',
    p_source_type => ords.source_type_plsql,
    p_source      => q'[
declare
  l_body      json_object_t;
  l_nome      varchar2(200);
  l_usuario   varchar2(100);
  l_senha     varchar2(200);
  l_exists    number := 0;

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

  l_nome := trim(coalesce(
    l_body.get_string('name'),
    l_body.get_string('nome')
  ));

  l_usuario := lower(trim(coalesce(
    l_body.get_string('login'),
    l_body.get_string('usuario')
  )));

  l_senha := trim(coalesce(
    l_body.get_string('password'),
    l_body.get_string('senha')
  ));

  if l_nome is null or length(l_nome) < 3 then
    send_json(400, json_object(
      'success' value false,
      'error' value 'Nome invalido. Informe ao menos 3 caracteres.'
    returning clob));
    return;
  end if;

  if l_usuario is null or instr(l_usuario, ' ') > 0 or length(l_usuario) < 3 then
    send_json(400, json_object(
      'success' value false,
      'error' value 'Usuario invalido. Use ao menos 3 caracteres e sem espacos.'
    returning clob));
    return;
  end if;

  if l_senha is null or length(l_senha) < 4 then
    send_json(400, json_object(
      'success' value false,
      'error' value 'Senha invalida. Use ao menos 4 caracteres.'
    returning clob));
    return;
  end if;

  select count(*)
    into l_exists
    from admin.usuarios_bolao
   where lower(usuario) = l_usuario;

  if l_exists > 0 then
    send_json(409, json_object(
      'success' value false,
      'error' value 'Usuario ja cadastrado.'
    returning clob));
    return;
  end if;

  insert into admin.usuarios_bolao (
    id_usuario,
    nome,
    usuario,
    senha
  ) values (
    admin.seq_usuarios_bolao.nextval,
    l_nome,
    l_usuario,
    l_senha
  );

  commit;

  send_json(201, json_object(
    'success' value true,
    'message' value 'Usuario cadastrado com sucesso.',
    'user' value json_object(
      'id' value (
        select id_usuario
          from admin.usuarios_bolao
         where lower(usuario) = l_usuario
      ),
      'name' value l_nome,
      'login' value l_usuario
    )
  returning clob));
exception
  when others then
    rollback;
    send_json(500, json_object(
      'success' value false,
      'error' value 'Erro ao cadastrar usuario.',
      'details' value sqlerrm
    returning clob));
end;
]'
  );

  ords.define_template(
    p_module_name => 'bolao_auth',
    p_pattern     => 'login'
  );

  ords.define_handler(
    p_module_name => 'bolao_auth',
    p_pattern     => 'login',
    p_method      => 'POST',
    p_source_type => ords.source_type_plsql,
    p_source      => q'[
declare
  l_body        json_object_t;
  l_usuario     varchar2(100);
  l_senha       varchar2(200);
  l_id_usuario  admin.usuarios_bolao.id_usuario%type;
  l_nome        admin.usuarios_bolao.nome%type;
  l_login       admin.usuarios_bolao.usuario%type;

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

  l_usuario := lower(trim(coalesce(
    l_body.get_string('login'),
    l_body.get_string('usuario')
  )));

  l_senha := trim(coalesce(
    l_body.get_string('password'),
    l_body.get_string('senha')
  ));

  if l_usuario is null or instr(l_usuario, ' ') > 0 or length(l_usuario) < 3 then
    send_json(400, json_object(
      'success' value false,
      'error' value 'Usuario invalido. Use ao menos 3 caracteres e sem espacos.'
    returning clob));
    return;
  end if;

  if l_senha is null or length(l_senha) < 4 then
    send_json(400, json_object(
      'success' value false,
      'error' value 'Senha invalida. Use ao menos 4 caracteres.'
    returning clob));
    return;
  end if;

  begin
    select id_usuario, nome, usuario
      into l_id_usuario, l_nome, l_login
      from admin.usuarios_bolao
     where lower(usuario) = l_usuario
       and senha = l_senha;
  exception
    when no_data_found then
      send_json(401, json_object(
        'success' value false,
        'error' value 'Login ou senha invalidos.'
      returning clob));
      return;
  end;

  send_json(200, json_object(
    'success' value true,
    'message' value 'Login realizado com sucesso.',
    'user' value json_object(
      'id' value l_id_usuario,
      'name' value l_nome,
      'login' value l_login
    )
  returning clob));
exception
  when others then
    send_json(500, json_object(
      'success' value false,
      'error' value 'Erro ao realizar login.',
      'details' value sqlerrm
    returning clob));
end;
]'
  );

  commit;
end;
/

prompt ==========================================
prompt Endpoints criados:
prompt POST /ords/admin/bolao-dosasah/register
prompt POST /ords/admin/bolao-dosasah/login
prompt ==========================================
