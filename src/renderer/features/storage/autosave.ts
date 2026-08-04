/**
 * Regra do salvamento automatico, separada de quem grava.
 *
 * Fica sozinha aqui porque e uma DECISAO, e nao um detalhe do App: quando vale
 * gravar sozinho e a pergunta que decide se o autosave protege o trabalho ou se
 * atrapalha o uso. Separada, ela pode ser conferida por numero no autoteste sem
 * escrever nada no disco -- e um teste que grava de verdade encheria a pasta de
 * quadros do usuario a cada execucao.
 */

export interface AutosaveState {
  /** O quadro ja foi salvo alguma vez e tem caminho em disco? */
  hasPath: boolean;
  /** Ha alteracoes nao gravadas? */
  dirty: boolean;
  /** Ja existe uma gravacao em andamento? */
  saving: boolean;
  /** Uma caixa de texto esta aberta? */
  editing: boolean;
}

export type AutosaveVerdict = 'salvar' | 'adiar' | 'nao';

/**
 * O que fazer agora.
 *
 *  - `nao`     nao ha o que gravar, ou nao ha onde: um quadro sem caminho nao
 *              tem nome, e inventar um encheria a pasta de "Quadro sem nome (3)"
 *              a cada rabisco de experiencia. Ate o primeiro `Ctrl+S`, quem
 *              protege o trabalho e o aviso ao fechar a janela.
 *  - `adiar`   ha o que gravar, mas nao agora: com uma caixa de texto aberta o
 *              conteudo ainda esta no editor e nao no documento, e gravar
 *              salvaria a versao anterior do texto. Com outra gravacao em
 *              andamento, duas escritas disputariam o mesmo arquivo.
 *  - `salvar`  pode gravar.
 */
export function autosaveVerdict(state: AutosaveState): AutosaveVerdict {
  if (!state.hasPath || !state.dirty) return 'nao';
  if (state.saving || state.editing) return 'adiar';
  return 'salvar';
}
