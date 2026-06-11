prompt ==========================================
prompt Tabela de Palpites do Bolao
prompt ==========================================

create table ADMIN.PALPITES_BOLAO (
  ID_PALPITE        number primary key,
  ID_USUARIO        number not null,
  ID_JOGO           varchar2(80) not null,
  GRUPO_JOGO        varchar2(20),
  TIME_CASA         varchar2(120) not null,
  TIME_FORA         varchar2(120) not null,
  GOLS_CASA         number(3) not null,
  GOLS_FORA         number(3) not null,
  DATA_PALPITE      timestamp default current_timestamp not null,
  constraint FK_PALPITES_USUARIO
    foreign key (ID_USUARIO)
    references ADMIN.USUARIOS_BOLAO (ID_USUARIO),
  constraint UK_PALPITE_USUARIO_JOGO
    unique (ID_USUARIO, ID_JOGO)
);

create sequence ADMIN.SEQ_PALPITES_BOLAO
  start with 1
  increment by 1
  nocache;

prompt ==========================================
prompt Exemplo de insert
prompt ==========================================
prompt insert into ADMIN.PALPITES_BOLAO (
prompt   ID_PALPITE, ID_USUARIO, ID_JOGO, GRUPO_JOGO,
prompt   TIME_CASA, TIME_FORA, GOLS_CASA, GOLS_FORA
prompt ) values (
prompt   ADMIN.SEQ_PALPITES_BOLAO.NEXTVAL, :id_usuario, :id_jogo, :grupo_jogo,
prompt   :time_casa, :time_fora, :gols_casa, :gols_fora
prompt );
