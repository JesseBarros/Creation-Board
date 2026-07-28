/** Um arquivo HTML de exportacao lido do disco, pronto para ser interpretado. */
export interface ImportSource {
  /** Nome sugerido para o quadro, derivado do arquivo. */
  name: string;
  html: string;
  /** Preenchido quando a leitura falhou; `html` vem vazio nesse caso. */
  error?: string;
}

/** Contagem do que foi reconhecido, mostrada ao usuario depois de importar. */
export interface ImportReport {
  name: string;
  textos: number;
  tracos: number;
  imagens: number;
  postits: number;
  /** Objetos encontrados mas nao suportados, agrupados por tipo. */
  ignorados: Record<string, number>;
  avisos: string[];
}
