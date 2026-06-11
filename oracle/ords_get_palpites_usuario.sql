begin
  ords.define_module(
    p_module_name    => 'bolaodosasah',
    p_base_path      => '/bolãodosasah/',
    p_items_per_page => 25,
    p_status         => 'PUBLISHED'
  );

  ords.define_template(
    p_module_name => 'bolaodosasah',
    p_pattern     => 'get_palpites_usuario'
  );

  ords.define_handler(
    p_module_name => 'bolaodosasah',
    p_pattern     => 'get_palpites_usuario',
    p_method      => 'GET',
    p_source_type => ords.source_type_query,
    p_source      => q'[
      select
        p.id_palpite,
        p.id_usuario,
        p.id_jogo,
        p.gols_casa,
        p.gols_fora,
        p.data_palpite,
        p.time_casa,
        p.time_fora
      from admin.palpites_bolao p
      where p.id_usuario = :id_usuario
      order by p.data_palpite desc, p.id_jogo
    ]'
  );

  commit;
end;
/

prompt Handler GET criado em /ords/admin/bolãodosasah/get_palpites_usuario?id_usuario=3
